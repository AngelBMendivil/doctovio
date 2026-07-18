import { db } from "@/lib/db";
import { logAudit } from "@/lib/services/audit";
import { generateSecureToken } from "@/lib/utils/tokens";
import type { CreatePrescriptionInput } from "@/lib/validations/prescription";

async function nextPrescriptionFolio(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], organizationId: string) {
  const year = new Date().getFullYear();
  const count = await tx.prescription.count({
    where: { organizationId, folio: { startsWith: `RX-${year}-` } },
  });
  return `RX-${year}-${String(count + 1).padStart(6, "0")}`;
}

/**
 * Crea y emite una receta en una sola transacción (folio + items).
 * Solo el médico puede emitir (verificado antes de llamar este servicio).
 * Una vez emitida, no se edita: una corrección crea una nueva versión (supersede).
 */
export async function issuePrescription(organizationId: string, doctorId: string, input: CreatePrescriptionInput) {
  const prescription = await db.$transaction(async (tx) => {
    const folio = await nextPrescriptionFolio(tx, organizationId);
    return tx.prescription.create({
      data: {
        organizationId,
        patientId: input.patientId,
        doctorId,
        consultationId: input.consultationId || null,
        folio,
        diagnosisText: input.diagnosisText || null,
        instructions: input.instructions || null,
        recommendations: input.recommendations || null,
        status: "ISSUED",
        issuedAt: new Date(),
        items: { create: input.items.map((it, idx) => ({ ...it, sortOrder: idx })) },
      },
      include: { items: true },
    });
  });

  await logAudit({ organizationId, userId: doctorId, action: "CREATE", entity: "prescription", entityId: prescription.id, newValues: prescription });
  return prescription;
}

export async function cancelPrescription(organizationId: string, doctorId: string, prescriptionId: string) {
  const current = await db.prescription.findFirstOrThrow({ where: { id: prescriptionId, organizationId } });
  if (current.status !== "ISSUED") throw new Error("Solo una receta emitida puede cancelarse.");

  const updated = await db.prescription.update({
    where: { id: prescriptionId },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  await logAudit({ organizationId, userId: doctorId, action: "UPDATE", entity: "prescription", entityId: prescriptionId, oldValues: { status: current.status }, newValues: { status: "CANCELLED" } });
  return updated;
}

/** Genera una nueva versión de la receta (corrección) y marca la anterior como sustituida. */
export async function supersedePrescription(
  organizationId: string,
  doctorId: string,
  originalId: string,
  input: CreatePrescriptionInput
) {
  return db.$transaction(async (tx) => {
    const original = await tx.prescription.findFirstOrThrow({ where: { id: originalId, organizationId } });
    const folio = await nextPrescriptionFolio(tx, organizationId);

    const next = await tx.prescription.create({
      data: {
        organizationId,
        patientId: input.patientId,
        doctorId,
        consultationId: input.consultationId || null,
        folio,
        diagnosisText: input.diagnosisText || null,
        instructions: input.instructions || null,
        recommendations: input.recommendations || null,
        status: "ISSUED",
        issuedAt: new Date(),
        supersedesId: original.id,
        items: { create: input.items.map((it, idx) => ({ ...it, sortOrder: idx })) },
      },
    });

    await tx.prescription.update({ where: { id: original.id }, data: { status: "SUPERSEDED" } });

    return next;
  });
}

/** Receta con todo lo necesario para imprimir/PDF. */
export async function getPrescriptionForPrint(organizationId: string, prescriptionId: string) {
  return db.prescription.findFirst({
    where: { id: prescriptionId, organizationId },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      // medicalProfile trae allergiesNegated: sin él no se puede distinguir
      // "sin alergias" de "sin preguntar" al imprimir la receta.
      patient: { include: { allergies: { where: { isActive: true } }, medicalProfile: true } },
      doctor: { include: { doctorProfile: true } },
      consultation: { include: { diagnoses: true } },
      supersedes: { select: { folio: true } },
      supersededBy: { select: { folio: true } },
    },
  });
}

/** Genera (o reutiliza) un token opaco para compartir la receta públicamente. */
export async function getOrCreateShareToken(organizationId: string, prescriptionId: string) {
  const rx = await db.prescription.findFirst({ where: { id: prescriptionId, organizationId } });
  if (!rx) throw new Error("Receta no encontrada.");
  if (rx.qrValidationCode) return rx.qrValidationCode;
  const token = generateSecureToken();
  await db.prescription.update({ where: { id: prescriptionId }, data: { qrValidationCode: token } });
  return token;
}

/** Consulta pública de una receta por su token (sin sesión). */
export async function getPrescriptionByShareToken(token: string) {
  return db.prescription.findFirst({
    where: { qrValidationCode: token },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      // medicalProfile trae allergiesNegated: sin él no se puede distinguir
      // "sin alergias" de "sin preguntar" al imprimir la receta.
      patient: { include: { allergies: { where: { isActive: true } }, medicalProfile: true } },
      doctor: { include: { doctorProfile: true } },
      consultation: { include: { diagnoses: true } },
      organization: { include: { settings: true, branches: { where: { isActive: true } } } },
      supersedes: { select: { folio: true } },
      supersededBy: { select: { folio: true } },
    },
  });
}

export async function listPatientPrescriptions(organizationId: string, patientId: string) {
  return db.prescription.findMany({
    where: { organizationId, patientId },
    include: { items: true, doctor: true },
    orderBy: { date: "desc" },
  });
}
