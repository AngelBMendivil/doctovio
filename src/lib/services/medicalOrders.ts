import { db } from "@/lib/db";
import { logAudit } from "@/lib/services/audit";
import type { CreateMedicalOrderInput } from "@/lib/validations/medicalOrder";

async function nextOrderFolio(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], organizationId: string) {
  const year = new Date().getFullYear();
  const count = await tx.medicalOrder.count({ where: { organizationId, folio: { startsWith: `OM-${year}-` } } });
  return `OM-${year}-${String(count + 1).padStart(6, "0")}`;
}

export async function issueMedicalOrder(organizationId: string, doctorId: string, input: CreateMedicalOrderInput) {
  const order = await db.$transaction(async (tx) => {
    const folio = await nextOrderFolio(tx, organizationId);
    return tx.medicalOrder.create({
      data: {
        organizationId,
        patientId: input.patientId,
        doctorId,
        consultationId: input.consultationId || null,
        folio,
        type: input.type,
        reason: input.reason || null,
        diagnosisText: input.diagnosisText || null,
        instructions: input.instructions || null,
        priority: input.priority,
        status: "ISSUED",
        issuedAt: new Date(),
        items: { create: input.items.map((it, idx) => ({ ...it, sortOrder: idx })) },
      },
      include: { items: true },
    });
  });

  await logAudit({ organizationId, userId: doctorId, action: "CREATE", entity: "medical_order", entityId: order.id, newValues: order });
  return order;
}

export async function completeMedicalOrder(organizationId: string, userId: string, orderId: string) {
  return db.medicalOrder.update({
    where: { id: orderId },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
}

export async function cancelMedicalOrder(organizationId: string, userId: string, orderId: string) {
  const current = await db.medicalOrder.findFirstOrThrow({ where: { id: orderId, organizationId } });
  const updated = await db.medicalOrder.update({ where: { id: orderId }, data: { status: "CANCELLED", cancelledAt: new Date() } });
  await logAudit({ organizationId, userId, action: "UPDATE", entity: "medical_order", entityId: orderId, oldValues: { status: current.status }, newValues: { status: "CANCELLED" } });
  return updated;
}

export async function listPatientMedicalOrders(organizationId: string, patientId: string) {
  return db.medicalOrder.findMany({
    where: { organizationId, patientId },
    include: { items: true, doctor: true },
    orderBy: { date: "desc" },
  });
}
