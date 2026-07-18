import { db } from "@/lib/db";
import { logAudit } from "@/lib/services/audit";

/** Inicia una consulta a partir de una visita (sala de espera -> consulta). */
export async function startConsultation(
  organizationId: string,
  userId: string,
  params: { visitId: string; patientId: string; doctorId: string; appointmentId?: string; type?: string; reason?: string }
) {
  const consultation = await db.$transaction(async (tx) => {
    const created = await tx.consultation.create({
      data: {
        organizationId,
        patientId: params.patientId,
        doctorId: params.doctorId,
        visitId: params.visitId,
        appointmentId: params.appointmentId,
        type: (params.type as never) ?? "GENERAL",
        reason: params.reason,
        status: "IN_PROGRESS",
        startTime: new Date(),
      },
    });
    await tx.visit.update({ where: { id: params.visitId }, data: { status: "IN_CONSULTATION", startedAt: new Date() } });
    if (params.appointmentId) {
      await tx.appointment.update({ where: { id: params.appointmentId }, data: { status: "IN_CONSULTATION" } });
    }
    return created;
  });

  await logAudit({ organizationId, userId, action: "CREATE", entity: "consultation", entityId: consultation.id });
  return consultation;
}

export async function updateConsultationDraft(
  organizationId: string,
  userId: string,
  consultationId: string,
  data: Partial<{
    currentIllness: string;
    physicalExam: string;
    assessment: string;
    plan: string;
    treatment: string;
    instructions: string;
    prognosis: string;
    followUp: string;
    followUpDate: Date;
    observations: string;
  }>
) {
  const current = await db.consultation.findFirstOrThrow({ where: { id: consultationId, organizationId } });
  if (current.status === "COMPLETED") {
    throw new Error("LOCKED: la consulta está finalizada; agrega una nota adicional en lugar de editar.");
  }
  return db.consultation.update({ where: { id: consultationId }, data });
}

/** Solo el médico puede finalizar. No se podrá editar libremente después. */
export async function finalizeConsultation(organizationId: string, userId: string, consultationId: string) {
  const consultation = await db.$transaction(async (tx) => {
    const updated = await tx.consultation.update({
      where: { id: consultationId },
      data: { status: "COMPLETED", finalizedAt: new Date(), endTime: new Date() },
    });
    await tx.visit.update({ where: { id: updated.visitId }, data: { status: "COMPLETED", completedAt: new Date() } });
    if (updated.appointmentId) {
      await tx.appointment.update({ where: { id: updated.appointmentId }, data: { status: "COMPLETED" } });
    }
    return updated;
  });

  await logAudit({ organizationId, userId, action: "UPDATE", entity: "consultation", entityId: consultationId, newValues: { status: "COMPLETED" } });
  return consultation;
}

/** Corrección posterior a una consulta finalizada: se agrega como nota, nunca se sobrescribe el original. */
export async function addConsultationAddendum(organizationId: string, userId: string, consultationId: string, note: string) {
  const created = await db.consultationNote.create({
    data: { consultationId, authorId: userId, note, isAddendum: true },
  });
  await logAudit({ organizationId, userId, action: "UPDATE", entity: "consultation_note", entityId: created.id, newValues: { note } });
  return created;
}

/** Lista de consultas (para la pantalla del médico). Ordena las activas primero. */
/**
 * Consultas de un rango de fechas, con su pago para saber si el ciclo cerró.
 *
 * Una consulta sigue "pendiente" mientras no esté finalizada Y cobrada: son
 * las dos condiciones que la sacan del trabajo del día. Se incluye `payment`
 * para que la pantalla pueda separarlas sin otra consulta.
 */
export async function listConsultations(
  organizationId: string,
  params?: { doctorId?: string; from?: Date; to?: Date; limit?: number }
) {
  return db.consultation.findMany({
    where: {
      organizationId,
      ...(params?.doctorId ? { doctorId: params.doctorId } : {}),
      ...(params?.from || params?.to
        ? { date: { ...(params.from ? { gte: params.from } : {}), ...(params.to ? { lte: params.to } : {}) } }
        : {}),
    },
    include: { patient: true, doctor: true, payment: true },
    orderBy: [{ date: "desc" }],
    take: params?.limit ?? 200,
  });
}

/**
 * Historial clínico del paciente para verlo DURANTE la consulta.
 *
 * Trae las consultas anteriores (nunca la actual) con lo que el médico
 * necesita de un vistazo: diagnósticos, recetas y signos vitales. Se excluyen
 * las canceladas: no aportan y ensucian la vista.
 */
export async function getPatientHistory(
  organizationId: string,
  patientId: string,
  excludeConsultationId?: string
) {
  return db.consultation.findMany({
    where: {
      organizationId,
      patientId,
      id: excludeConsultationId ? { not: excludeConsultationId } : undefined,
      status: { not: "CANCELLED" },
    },
    include: {
      doctor: { select: { fullName: true } },
      diagnoses: { orderBy: { date: "desc" } },
      prescriptions: { include: { items: true } },
      medicalOrders: { include: { items: true } },
      vitalSigns: { orderBy: { recordedAt: "desc" }, take: 1 },
    },
    orderBy: { date: "desc" },
    take: 20,
  });
}

export async function getConsultationDetail(organizationId: string, consultationId: string) {
  return db.consultation.findFirst({
    where: { id: consultationId, organizationId },
    include: {
      patient: true,
      doctor: true,
      visit: true,
      vitalSigns: { orderBy: { recordedAt: "desc" } },
      diagnoses: { orderBy: { date: "desc" } },
      prescriptions: { include: { items: true } },
      medicalOrders: { include: { items: true } },
      notes: { orderBy: { createdAt: "desc" } },
      documents: true,
    },
  });
}
