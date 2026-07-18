import { db } from "@/lib/db";
import type { CreateVisitInput } from "@/lib/validations/visit";
import { logAudit } from "@/lib/services/audit";

/** Registra la llegada de un paciente con cita: crea la visita y actualiza el estado de la cita. */
export async function createVisit(organizationId: string, userId: string, input: CreateVisitInput) {
  const visit = await db.$transaction(async (tx) => {
    const created = await tx.visit.create({
      data: {
        organizationId,
        branchId: input.branchId,
        patientId: input.patientId,
        appointmentId: input.appointmentId || null,
        doctorId: input.doctorId,
        arrivalType: input.arrivalType,
        reason: input.reason || null,
        priority: input.priority,
        status: "WAITING",
        createdById: userId,
      },
    });

    if (input.appointmentId) {
      await tx.appointment.update({ where: { id: input.appointmentId }, data: { status: "ARRIVED" } });
      await tx.appointmentStatusHistory.create({
        data: { appointmentId: input.appointmentId, toStatus: "ARRIVED", changedById: userId, reason: "Llegada registrada" },
      });
    }

    return created;
  });

  await logAudit({ organizationId, userId, action: "CREATE", entity: "visit", entityId: visit.id, newValues: visit });
  return visit;
}

export async function updateVisitStatus(
  organizationId: string,
  userId: string,
  visitId: string,
  status: Parameters<typeof db.visit.update>[0]["data"]["status"]
) {
  const current = await db.visit.findFirstOrThrow({ where: { id: visitId, organizationId } });

  const data: Parameters<typeof db.visit.update>[0]["data"] = { status };
  if (status === "IN_CONSULTATION" && !current.startedAt) data.startedAt = new Date();
  if (status === "COMPLETED") data.completedAt = new Date();

  const updated = await db.visit.update({ where: { id: visitId }, data });

  await logAudit({
    organizationId,
    userId,
    action: "UPDATE",
    entity: "visit",
    entityId: visitId,
    oldValues: { status: current.status },
    newValues: { status },
  });

  return updated;
}

/** Sala de espera: agrupa por columnas Agendados / En espera / En consulta / Finalizados (del día). */
export async function getWaitingRoomBoard(organizationId: string, branchId?: string) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const [scheduled, waiting, inConsultation, completed] = await Promise.all([
    db.appointment.findMany({
      where: {
        organizationId,
        branchId,
        scheduledDate: { gte: startOfDay, lte: endOfDay },
        status: { in: ["TO_CONFIRM", "CONFIRMED"] },
      },
      include: { patient: true, doctor: true },
      orderBy: { startTime: "asc" },
    }),
    db.visit.findMany({
      where: { organizationId, branchId, status: { in: ["REGISTERED", "WAITING", "IN_TRIAGE"] } },
      include: { patient: true, doctor: true, appointment: true },
      orderBy: [{ priority: "desc" }, { arrivalTime: "asc" }],
    }),
    db.visit.findMany({
      where: { organizationId, branchId, status: "IN_CONSULTATION" },
      include: { patient: true, doctor: true, appointment: true },
      orderBy: { startedAt: "asc" },
    }),
    db.visit.findMany({
      where: {
        organizationId,
        branchId,
        status: "COMPLETED",
        completedAt: { gte: startOfDay, lte: endOfDay },
      },
      include: { patient: true, doctor: true, appointment: true },
      orderBy: { completedAt: "desc" },
    }),
  ]);

  return { scheduled, waiting, inConsultation, completed };
}
