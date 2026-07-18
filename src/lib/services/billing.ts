import { db } from "@/lib/db";
import { logAudit } from "@/lib/services/audit";
import type { PaymentMethod, PaymentOrigin } from "@prisma/client";

/** Consultas finalizadas que aún no tienen pago (cola "Por pagar"). */
export async function listPendingPayments(organizationId: string) {
  return db.consultation.findMany({
    where: { organizationId, status: "COMPLETED", payment: { is: null } },
    include: { patient: true, doctor: true },
    orderBy: { finalizedAt: "desc" },
    take: 100,
  });
}

/** Detalle de una consulta por cobrar (con precios base de la organización). */
export async function getConsultationForPayment(organizationId: string, consultationId: string) {
  const consultation = await db.consultation.findFirst({
    where: { id: consultationId, organizationId },
    include: {
      patient: { include: { insurances: { where: { isActive: true }, take: 1 } } },
      doctor: true,
      payment: true,
    },
  });
  if (!consultation) return null;

  const [settings, insurers] = await Promise.all([
    db.organizationSettings.findUnique({ where: { organizationId } }),
    db.insurer.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    consultation,
    basePriceMxn: settings?.basePriceMxn ?? null,
    basePriceUsd: settings?.basePriceUsd ?? null,
    currency: settings?.currency ?? "MXN",
    insurers,
    // Si el paciente trae póliza activa, se sugiere ese origen y esa aseguradora.
    patientInsurerId: consultation.patient.insurances[0]?.insurerId ?? null,
  };
}

/** Registra el pago de una consulta (cierra el ciclo del paciente). */
export async function createPayment(
  organizationId: string,
  userId: string,
  data: {
    consultationId: string;
    patientId: string;
    amount: number;
    currency: string;
    method: PaymentMethod;
    origin: PaymentOrigin;
    insurerId?: string;
    reference?: string;
    notes?: string;
  }
) {
  const existing = await db.payment.findUnique({ where: { consultationId: data.consultationId } });
  if (existing) throw new Error("Esta consulta ya tiene un pago registrado.");

  // El nombre de la aseguradora se congela en el pago: si mañana cambia el
  // catálogo, el reporte histórico sigue mostrando lo que se cobró ese día.
  let insurerName: string | null = null;
  if (data.origin === "INSURANCE" && data.insurerId) {
    const insurer = await db.insurer.findFirst({
      where: { id: data.insurerId, organizationId },
      select: { name: true },
    });
    if (!insurer) throw new Error("La aseguradora seleccionada no existe en el catálogo.");
    insurerName = insurer.name;
  }

  const payment = await db.payment.create({
    data: {
      organizationId,
      patientId: data.patientId,
      consultationId: data.consultationId,
      amount: data.amount,
      currency: data.currency,
      method: data.method,
      origin: data.origin,
      insurerId: data.origin === "INSURANCE" ? data.insurerId : null,
      insurerName,
      reference: data.reference || null,
      notes: data.notes || null,
      createdById: userId,
    },
  });

  await logAudit({ organizationId, userId, action: "CREATE", entity: "payment", entityId: payment.id, newValues: payment });
  return payment;
}
