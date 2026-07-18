import { db } from "@/lib/db";
import type { AppointmentStatus } from "@prisma/client";
import type { CreateAppointmentInput } from "@/lib/validations/appointment";
import { logAudit } from "@/lib/services/audit";

/**
 * Verifica traslapes de horario para un médico. Si allowOverbook es true,
 * se ignora el traslape (sobrecupo autorizado explícitamente).
 */
async function hasOverlap(organizationId: string, doctorId: string, start: Date, end: Date, excludeId?: string) {
  // Trae las citas del médico en una ventana amplia alrededor del horario propuesto
  // (las duraciones del MVP nunca exceden 8h) y revisa el traslape real en memoria,
  // porque Prisma no puede calcular "startTime + duration" dentro del where.
  const windowStart = new Date(start.getTime() - 8 * 60 * 60000);
  const windowEnd = new Date(end.getTime() + 8 * 60 * 60000);

  const candidates = await db.appointment.findMany({
    where: {
      organizationId,
      doctorId,
      id: excludeId ? { not: excludeId } : undefined,
      status: { notIn: ["CANCELLED", "NO_SHOW", "RESCHEDULED"] },
      startTime: { gte: windowStart, lte: windowEnd },
    },
    select: { startTime: true, durationMinutes: true },
  });

  return candidates.some((c) => {
    const cEnd = new Date(c.startTime.getTime() + c.durationMinutes * 60000);
    return c.startTime < end && cEnd > start;
  });
}

export async function createAppointment(organizationId: string, userId: string, input: CreateAppointmentInput) {
  const start = input.startTime;
  const end = new Date(start.getTime() + input.durationMinutes * 60000);

  if (!input.allowOverbook) {
    const overlap = await hasOverlap(organizationId, input.doctorId, start, end);
    if (overlap) {
      throw new Error("OVERLAP: el médico ya tiene una cita en ese horario. Marca sobrecupo si el médico lo autoriza.");
    }
  }

  const appointment = await db.appointment.create({
    data: {
      organizationId,
      branchId: input.branchId,
      patientId: input.patientId,
      doctorId: input.doctorId,
      scheduledDate: input.scheduledDate,
      startTime: start,
      durationMinutes: input.durationMinutes,
      type: input.type,
      reason: input.reason || null,
      channel: input.channel,
      notes: input.notes || null,
      isOverbooked: input.allowOverbook,
      createdById: userId,
      statusHistory: { create: { toStatus: "TO_CONFIRM", changedById: userId } },
    },
  });

  await logAudit({ organizationId, userId, action: "CREATE", entity: "appointment", entityId: appointment.id, newValues: appointment });

  return appointment;
}

export async function changeAppointmentStatus(
  organizationId: string,
  userId: string,
  appointmentId: string,
  toStatus: AppointmentStatus,
  reason?: string
) {
  const current = await db.appointment.findFirstOrThrow({ where: { id: appointmentId, organizationId } });

  const updated = await db.$transaction(async (tx) => {
    const appt = await tx.appointment.update({
      where: { id: appointmentId },
      data: { status: toStatus },
    });
    await tx.appointmentStatusHistory.create({
      data: { appointmentId, fromStatus: current.status, toStatus, changedById: userId, reason },
    });
    return appt;
  });

  await logAudit({
    organizationId,
    userId,
    action: "UPDATE",
    entity: "appointment",
    entityId: appointmentId,
    oldValues: { status: current.status },
    newValues: { status: toStatus },
  });

  return updated;
}

/** Reprograma conservando historial: no se borra la cita, se actualiza y se marca en el historial. */
export async function rescheduleAppointment(
  organizationId: string,
  userId: string,
  params: { appointmentId: string; scheduledDate: Date; startTime: Date; durationMinutes: number; reason?: string }
) {
  const current = await db.appointment.findFirstOrThrow({
    where: { id: params.appointmentId, organizationId },
  });

  return db.$transaction(async (tx) => {
    const updated = await tx.appointment.update({
      where: { id: params.appointmentId },
      data: {
        scheduledDate: params.scheduledDate,
        startTime: params.startTime,
        durationMinutes: params.durationMinutes,
        status: "CONFIRMED",
      },
    });
    await tx.appointmentStatusHistory.create({
      data: {
        appointmentId: params.appointmentId,
        fromStatus: current.status,
        toStatus: "RESCHEDULED",
        changedById: userId,
        reason: params.reason ?? "Reprogramación",
      },
    });
    return updated;
  });
}

export async function listAgenda(
  organizationId: string,
  params: { from: Date; to: Date; doctorId?: string; branchId?: string }
) {
  return db.appointment.findMany({
    where: {
      organizationId,
      startTime: { gte: params.from, lte: params.to },
      doctorId: params.doctorId,
      branchId: params.branchId,
    },
    include: { patient: true, doctor: true },
    orderBy: { startTime: "asc" },
  });
}

/**
 * Tablero del día: citas de hoy con paciente, médico, visita (si ya llegó) y el
 * último token de prerregistro, para mostrar estatus y acciones.
 */
export async function listTodayBoard(organizationId: string, dateStr: string) {
  const from = new Date(`${dateStr}T00:00:00`);
  const to = new Date(`${dateStr}T23:59:59`);
  return db.appointment.findMany({
    where: {
      organizationId,
      startTime: { gte: from, lte: to },
      isActive: true,
      status: { notIn: ["CANCELLED", "RESCHEDULED"] },
    },
    include: {
      patient: true,
      doctor: true,
      visit: { include: { consultation: { include: { payment: true } } } },
      publicFormTokens: {
        where: { type: "PRE_REGISTRATION" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { startTime: "asc" },
  });
}
