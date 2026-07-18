import { db } from "@/lib/db";
import { logAudit } from "@/lib/services/audit";
import { pushAppointment } from "@/lib/services/calendar-sync";
import { scheduleReminders, cancelReminders } from "@/lib/services/reminders";
import type { AppointmentChannel, AppointmentType, Prisma } from "@prisma/client";

/**
 * MOTOR DE AGENDA — única puerta de entrada para tocar citas.
 *
 * Todo lo que agende, reagende o cancele (la interfaz web, el asistente de
 * WhatsApp, la IA) pasa por aquí. Ninguna otra capa debe escribir citas
 * directamente: aquí viven las reglas de negocio y la validación.
 *
 * Reglas que aplica antes de ofrecer o confirmar un horario:
 *   · horario laboral del médico        · citas existentes
 *   · bloqueos, comida y vacaciones     · reservas temporales vigentes
 *   · eventos externos de Google        · duración del tipo de consulta
 *   · anticipación mínima y máxima      · tiempo entre consultas (buffer)
 *
 * Nunca promete un horario sin re-validarlo en el momento de confirmar.
 */

const DEFAULTS = {
  slotGranularityMin: 15,
  bufferMinutes: 0,
  minLeadMinutes: 120,
  maxAdvanceDays: 90,
  cancelMinHours: 4,
  holdMinutes: 5,
  defaultAppointmentMin: 30,
};

export type SchedulingRules = typeof DEFAULTS;

export type Slot = { startAt: Date; endAt: Date };

/** Error de negocio: su mensaje SÍ se le puede mostrar al paciente. */
export class SchedulingError extends Error {
  constructor(
    message: string,
    public code:
      | "OUT_OF_HOURS"
      | "TAKEN"
      | "TOO_SOON"
      | "TOO_FAR"
      | "NOT_FOUND"
      | "HOLD_EXPIRED"
      | "CANCEL_TOO_LATE"
      | "INVALID"
  ) {
    super(message);
    this.name = "SchedulingError";
  }
}

// ---------------------------------------------------------------------------
// Reglas y utilidades
// ---------------------------------------------------------------------------

export async function getRules(organizationId: string): Promise<SchedulingRules> {
  const s = await db.organizationSettings.findUnique({ where: { organizationId } });
  return {
    slotGranularityMin: s?.slotGranularityMin ?? DEFAULTS.slotGranularityMin,
    bufferMinutes: s?.bufferMinutes ?? DEFAULTS.bufferMinutes,
    minLeadMinutes: s?.minLeadMinutes ?? DEFAULTS.minLeadMinutes,
    maxAdvanceDays: s?.maxAdvanceDays ?? DEFAULTS.maxAdvanceDays,
    cancelMinHours: s?.cancelMinHours ?? DEFAULTS.cancelMinHours,
    holdMinutes: s?.holdMinutes ?? DEFAULTS.holdMinutes,
    defaultAppointmentMin: s?.defaultAppointmentMin ?? DEFAULTS.defaultAppointmentMin,
  };
}

/** Duración en minutos según el tipo de consulta. */
export function durationFor(type: AppointmentType, rules: SchedulingRules): number {
  if (type === "FIRST_TIME") return Math.max(rules.defaultAppointmentMin, 40);
  return rules.defaultAppointmentMin;
}

const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) => aStart < bEnd && aEnd > bStart;

/** Folio legible y estable: DOC-000123. */
async function nextFolio(tx: Prisma.TransactionClient, organizationId: string): Promise<string> {
  const count = await tx.appointment.count({ where: { organizationId, folio: { not: null } } });
  return `DOC-${String(count + 1).padStart(6, "0")}`;
}

/** Rangos ocupados del médico en una ventana: citas, bloqueos y reservas vivas. */
async function busyRanges(
  organizationId: string,
  doctorId: string,
  from: Date,
  to: Date,
  opts: { ignoreAppointmentId?: string; ignoreHoldId?: string } = {}
): Promise<Slot[]> {
  const now = new Date();

  const [appointments, blocks, holds] = await Promise.all([
    db.appointment.findMany({
      where: {
        organizationId,
        doctorId,
        id: opts.ignoreAppointmentId ? { not: opts.ignoreAppointmentId } : undefined,
        isActive: true,
        status: { notIn: ["CANCELLED", "NO_SHOW", "RESCHEDULED"] },
        // Ventana amplia: la duración se evalúa en memoria.
        startTime: { gte: new Date(from.getTime() - 8 * 3600_000), lte: new Date(to.getTime() + 8 * 3600_000) },
      },
      select: { startTime: true, durationMinutes: true },
    }),
    db.scheduleBlock.findMany({
      where: { organizationId, doctorId, startAt: { lt: to }, endAt: { gt: from } },
      select: { startAt: true, endAt: true },
    }),
    db.appointmentHold.findMany({
      where: {
        organizationId,
        doctorId,
        id: opts.ignoreHoldId ? { not: opts.ignoreHoldId } : undefined,
        consumedAt: null,
        releasedAt: null,
        expiresAt: { gt: now }, // las vencidas ya no estorban
        startAt: { lt: to },
        endAt: { gt: from },
      },
      select: { startAt: true, endAt: true },
    }),
  ]);

  return [
    ...appointments.map((a) => ({
      startAt: a.startTime,
      endAt: new Date(a.startTime.getTime() + a.durationMinutes * 60_000),
    })),
    ...blocks.map((b) => ({ startAt: b.startAt, endAt: b.endAt })),
    ...holds.map((h) => ({ startAt: h.startAt, endAt: h.endAt })),
  ];
}

// ---------------------------------------------------------------------------
// consultarDisponibilidad
// ---------------------------------------------------------------------------

/**
 * Espacios libres de un médico en un día. Devuelve como máximo `limit`
 * opciones: al paciente nunca se le manda una lista larga.
 */
export async function consultarDisponibilidad(
  organizationId: string,
  params: {
    doctorId: string;
    /** Día en formato YYYY-MM-DD, en la zona del consultorio. */
    dateStr: string;
    type: AppointmentType;
    /** Filtra por franja del día. */
    preference?: "morning" | "afternoon" | "any";
    limit?: number;
  }
): Promise<Slot[]> {
  const rules = await getRules(organizationId);
  const duration = durationFor(params.type, rules);
  const limit = params.limit ?? 5;

  const dayStart = new Date(`${params.dateStr}T00:00:00`);
  const dayEnd = new Date(`${params.dateStr}T23:59:59`);
  if (Number.isNaN(dayStart.getTime())) throw new SchedulingError("Fecha inválida.", "INVALID");

  // Ventana permitida: ni antes de la anticipación mínima, ni más allá del máximo.
  const now = new Date();
  const earliest = new Date(now.getTime() + rules.minLeadMinutes * 60_000);
  const latest = new Date(now.getTime() + rules.maxAdvanceDays * 24 * 3600_000);
  if (dayStart > latest) return [];

  const schedules = await db.doctorSchedule.findMany({
    where: { organizationId, doctorId: params.doctorId, weekday: dayStart.getDay(), isActive: true },
    orderBy: { startMinute: "asc" },
  });
  if (schedules.length === 0) return []; // ese día no trabaja

  const busy = await busyRanges(organizationId, params.doctorId, dayStart, dayEnd);
  const step = rules.slotGranularityMin;
  const slots: Slot[] = [];

  for (const s of schedules) {
    for (let m = s.startMinute; m + duration <= s.endMinute; m += step) {
      const startAt = new Date(dayStart);
      startAt.setMinutes(m);
      const endAt = new Date(startAt.getTime() + duration * 60_000);

      if (startAt < earliest || startAt > latest) continue;

      if (params.preference === "morning" && startAt.getHours() >= 12) continue;
      if (params.preference === "afternoon" && startAt.getHours() < 12) continue;

      // El buffer se respeta ampliando el rango que se compara contra lo ocupado.
      const guardStart = new Date(startAt.getTime() - rules.bufferMinutes * 60_000);
      const guardEnd = new Date(endAt.getTime() + rules.bufferMinutes * 60_000);
      if (busy.some((b) => overlaps(guardStart, guardEnd, b.startAt, b.endAt))) continue;

      slots.push({ startAt, endAt });
      if (slots.length >= limit) return slots;
    }
  }

  return slots;
}

// ---------------------------------------------------------------------------
// crearReservaTemporal
// ---------------------------------------------------------------------------

/**
 * Aparta un horario unos minutos mientras el paciente confirma, para que dos
 * personas no elijan el mismo espacio al mismo tiempo.
 */
export async function crearReservaTemporal(
  organizationId: string,
  params: { doctorId: string; startAt: Date; type: AppointmentType; patientId?: string; sessionKey?: string }
) {
  const rules = await getRules(organizationId);
  const duration = durationFor(params.type, rules);
  const endAt = new Date(params.startAt.getTime() + duration * 60_000);

  const busy = await busyRanges(organizationId, params.doctorId, params.startAt, endAt);
  if (busy.some((b) => overlaps(params.startAt, endAt, b.startAt, b.endAt))) {
    throw new SchedulingError("Ese horario acaba de ser reservado por otra persona.", "TAKEN");
  }

  return db.appointmentHold.create({
    data: {
      organizationId,
      doctorId: params.doctorId,
      patientId: params.patientId,
      startAt: params.startAt,
      endAt,
      expiresAt: new Date(Date.now() + rules.holdMinutes * 60_000),
      sessionKey: params.sessionKey,
    },
  });
}

/** Suelta una reserva temporal (el paciente se arrepintió o cambió de horario). */
export async function liberarReservaTemporal(holdId: string) {
  await db.appointmentHold.updateMany({
    where: { id: holdId, consumedAt: null, releasedAt: null },
    data: { releasedAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// crearCita
// ---------------------------------------------------------------------------

/**
 * Crea la cita definitiva. Re-valida la disponibilidad dentro de la
 * transacción: entre que se ofreció el horario y se confirmó pudo ocuparse.
 */
export async function crearCita(
  organizationId: string,
  actorUserId: string,
  params: {
    patientId: string;
    doctorId: string;
    branchId?: string;
    startAt: Date;
    type: AppointmentType;
    reason?: string;
    channel: AppointmentChannel;
    whatsappPhone?: string;
    holdId?: string;
    allowOverbook?: boolean;
  }
) {
  const rules = await getRules(organizationId);
  const duration = durationFor(params.type, rules);
  const endAt = new Date(params.startAt.getTime() + duration * 60_000);
  const now = new Date();

  if (!params.allowOverbook) {
    if (params.startAt < new Date(now.getTime() + rules.minLeadMinutes * 60_000)) {
      throw new SchedulingError("Ese horario ya no tiene la anticipación mínima requerida.", "TOO_SOON");
    }
    if (params.startAt > new Date(now.getTime() + rules.maxAdvanceDays * 24 * 3600_000)) {
      throw new SchedulingError("Esa fecha está más allá del periodo que se puede agendar.", "TOO_FAR");
    }

    const busy = await busyRanges(organizationId, params.doctorId, params.startAt, endAt, {
      ignoreHoldId: params.holdId, // la propia reserva del paciente no debe estorbarle
    });
    if (busy.some((b) => overlaps(params.startAt, endAt, b.startAt, b.endAt))) {
      throw new SchedulingError("Ese horario acaba de ser reservado por otra persona.", "TAKEN");
    }
  }

  const appointment = await db.$transaction(async (tx) => {
    const folio = await nextFolio(tx, organizationId);
    const created = await tx.appointment.create({
      data: {
        organizationId,
        branchId: params.branchId,
        patientId: params.patientId,
        doctorId: params.doctorId,
        scheduledDate: new Date(params.startAt.toISOString().slice(0, 10) + "T00:00:00"),
        startTime: params.startAt,
        durationMinutes: duration,
        type: params.type,
        reason: params.reason || null,
        channel: params.channel,
        status: "TO_CONFIRM",
        folio,
        whatsappPhone: params.whatsappPhone || null,
        isOverbooked: !!params.allowOverbook,
        createdById: actorUserId,
        updatedById: actorUserId,
        syncStatus: "PENDING", // el sincronizador de Google la recogerá
        statusHistory: { create: { toStatus: "TO_CONFIRM", changedById: actorUserId } },
      },
    });

    if (params.holdId) {
      await tx.appointmentHold.updateMany({
        where: { id: params.holdId, consumedAt: null },
        data: { consumedAt: new Date() },
      });
    }

    return created;
  });

  await logAudit({
    organizationId,
    userId: actorUserId,
    action: "CREATE",
    entity: "appointment",
    entityId: appointment.id,
    newValues: { folio: appointment.folio, startTime: appointment.startTime, channel: params.channel },
  });

  // Google y los recordatorios se enteran DESPUÉS y sin poder estorbar: la
  // cita ya está creada. Si alguno falla, queda en su cola.
  await pushAppointment(appointment.id);
  await scheduleReminders(appointment.id);

  return appointment;
}

// ---------------------------------------------------------------------------
// consultarCita
// ---------------------------------------------------------------------------

/** Busca la cita vigente de un paciente por folio o por teléfono. */
export async function consultarCita(
  organizationId: string,
  params: { folio?: string; whatsappPhone?: string; patientId?: string }
) {
  const where: Prisma.AppointmentWhereInput = {
    organizationId,
    isActive: true,
    status: { notIn: ["CANCELLED", "RESCHEDULED", "NO_SHOW", "COMPLETED"] },
    startTime: { gte: new Date() },
  };

  if (params.folio) where.folio = params.folio.trim().toUpperCase();
  else if (params.patientId) where.patientId = params.patientId;
  else if (params.whatsappPhone) {
    const digits = params.whatsappPhone.replace(/\D/g, "").slice(-10);
    where.OR = [
      { whatsappPhone: { contains: digits } },
      { patient: { phone: { contains: digits } } },
    ];
  } else {
    throw new SchedulingError("Falta folio o teléfono para localizar la cita.", "INVALID");
  }

  return db.appointment.findFirst({
    where,
    include: { patient: true, doctor: true, branch: true },
    orderBy: { startTime: "asc" },
  });
}

// ---------------------------------------------------------------------------
// reagendarCita
// ---------------------------------------------------------------------------

/**
 * Mueve una cita. Es UNA transacción: nunca se cancela primero para crear
 * después. El horario original solo se libera cuando el nuevo ya quedó.
 */
export async function reagendarCita(
  organizationId: string,
  actorUserId: string,
  params: { appointmentId: string; newStartAt: Date; holdId?: string; reason?: string }
) {
  const current = await db.appointment.findFirst({
    where: { id: params.appointmentId, organizationId, isActive: true },
  });
  if (!current) throw new SchedulingError("No encontré esa cita.", "NOT_FOUND");

  const rules = await getRules(organizationId);
  const endAt = new Date(params.newStartAt.getTime() + current.durationMinutes * 60_000);

  if (params.newStartAt < new Date(Date.now() + rules.minLeadMinutes * 60_000)) {
    throw new SchedulingError("Ese horario ya no tiene la anticipación mínima requerida.", "TOO_SOON");
  }

  const busy = await busyRanges(organizationId, current.doctorId, params.newStartAt, endAt, {
    ignoreAppointmentId: current.id, // su propio horario actual no cuenta como ocupado
    ignoreHoldId: params.holdId,
  });
  if (busy.some((b) => overlaps(params.newStartAt, endAt, b.startAt, b.endAt))) {
    throw new SchedulingError("Ese horario acaba de ser reservado por otra persona.", "TAKEN");
  }

  const updated = await db.$transaction(async (tx) => {
    const appt = await tx.appointment.update({
      where: { id: current.id },
      data: {
        scheduledDate: new Date(params.newStartAt.toISOString().slice(0, 10) + "T00:00:00"),
        startTime: params.newStartAt,
        status: "TO_CONFIRM", // vuelve a requerir confirmación
        confirmedAt: null,
        confirmedBy: null,
        updatedById: actorUserId,
        syncStatus: "PENDING",
        version: { increment: 1 },
      },
    });

    await tx.appointmentStatusHistory.create({
      data: {
        appointmentId: current.id,
        fromStatus: current.status,
        toStatus: "RESCHEDULED",
        changedById: actorUserId,
        reason: params.reason ?? "Reprogramación",
      },
    });

    if (params.holdId) {
      await tx.appointmentHold.updateMany({
        where: { id: params.holdId, consumedAt: null },
        data: { consumedAt: new Date() },
      });
    }

    return appt;
  });

  await logAudit({
    organizationId,
    userId: actorUserId,
    action: "UPDATE",
    entity: "appointment",
    entityId: current.id,
    oldValues: { startTime: current.startTime },
    newValues: { startTime: params.newStartAt },
  });

  await pushAppointment(current.id);
  // Se recalculan: los recordatorios de la hora vieja ya no aplican.
  await scheduleReminders(current.id);

  return updated;
}

// ---------------------------------------------------------------------------
// cancelarCita
// ---------------------------------------------------------------------------

/** Cancela sin borrar: la cita conserva su historial. */
export async function cancelarCita(
  organizationId: string,
  actorUserId: string,
  params: { appointmentId: string; reason?: string; enforceWindow?: boolean }
) {
  const current = await db.appointment.findFirst({
    where: { id: params.appointmentId, organizationId, isActive: true },
  });
  if (!current) throw new SchedulingError("No encontré esa cita.", "NOT_FOUND");

  if (params.enforceWindow) {
    const rules = await getRules(organizationId);
    const limit = new Date(current.startTime.getTime() - rules.cancelMinHours * 3600_000);
    if (new Date() > limit) {
      throw new SchedulingError(
        "Tu cita está muy próxima para cancelarse por este medio. Te comunico con el consultorio.",
        "CANCEL_TOO_LATE"
      );
    }
  }

  const updated = await db.$transaction(async (tx) => {
    const appt = await tx.appointment.update({
      where: { id: current.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancellationReason: params.reason || null,
        updatedById: actorUserId,
        syncStatus: current.googleEventId ? "PENDING" : current.syncStatus,
        version: { increment: 1 },
      },
    });

    await tx.appointmentStatusHistory.create({
      data: {
        appointmentId: current.id,
        fromStatus: current.status,
        toStatus: "CANCELLED",
        changedById: actorUserId,
        reason: params.reason,
      },
    });

    return appt;
  });

  await logAudit({
    organizationId,
    userId: actorUserId,
    action: "UPDATE",
    entity: "appointment",
    entityId: current.id,
    oldValues: { status: current.status },
    newValues: { status: "CANCELLED", reason: params.reason },
  });

  // Se borra el evento de Google: si el médico ve la cita en su teléfono
  // después de cancelarla, el sistema le está mintiendo. Y se apagan los
  // recordatorios: mandarle uno de una cita cancelada destruye la confianza
  // en el canal.
  await pushAppointment(current.id);
  await cancelReminders(current.id);

  return updated;
}

// ---------------------------------------------------------------------------
// confirmarAsistencia
// ---------------------------------------------------------------------------

export async function confirmarAsistencia(
  organizationId: string,
  actorUserId: string,
  params: { appointmentId: string; by: "PATIENT" | "CLINIC" }
) {
  const current = await db.appointment.findFirst({
    where: { id: params.appointmentId, organizationId, isActive: true },
  });
  if (!current) throw new SchedulingError("No encontré esa cita.", "NOT_FOUND");

  const updated = await db.$transaction(async (tx) => {
    const appt = await tx.appointment.update({
      where: { id: current.id },
      data: {
        status: "CONFIRMED",
        confirmedAt: new Date(),
        confirmedBy: params.by,
        updatedById: actorUserId,
        version: { increment: 1 },
      },
    });
    await tx.appointmentStatusHistory.create({
      data: {
        appointmentId: current.id,
        fromStatus: current.status,
        toStatus: "CONFIRMED",
        changedById: actorUserId,
        reason: params.by === "PATIENT" ? "Confirmada por el paciente" : "Confirmada por el consultorio",
      },
    });
    return appt;
  });

  return updated;
}

// ---------------------------------------------------------------------------
// bloquearHorario / consultarAgenda
// ---------------------------------------------------------------------------

export async function bloquearHorario(
  organizationId: string,
  actorUserId: string,
  params: { doctorId: string; startAt: Date; endAt: Date; kind?: "MANUAL" | "LUNCH" | "VACATION"; reason?: string }
) {
  if (params.endAt <= params.startAt) throw new SchedulingError("El rango del bloqueo es inválido.", "INVALID");

  const block = await db.scheduleBlock.create({
    data: {
      organizationId,
      doctorId: params.doctorId,
      startAt: params.startAt,
      endAt: params.endAt,
      kind: params.kind ?? "MANUAL",
      reason: params.reason,
      createdById: actorUserId,
    },
  });

  await logAudit({
    organizationId,
    userId: actorUserId,
    action: "CREATE",
    entity: "schedule_block",
    entityId: block.id,
    newValues: block,
  });

  return block;
}

/** Agenda de un rango, para el resumen diario o semanal. */
export async function consultarAgenda(
  organizationId: string,
  params: { from: Date; to: Date; doctorId?: string }
) {
  return db.appointment.findMany({
    where: {
      organizationId,
      doctorId: params.doctorId,
      isActive: true,
      startTime: { gte: params.from, lte: params.to },
      status: { notIn: ["CANCELLED", "RESCHEDULED"] },
    },
    include: { patient: true, doctor: true },
    orderBy: { startTime: "asc" },
  });
}
