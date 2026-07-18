import { db } from "@/lib/db";
import type { Prisma, InsuranceAuthStatus } from "@prisma/client";
import type { CreateInsurerInput } from "@/lib/validations/insurer";

export type ChecklistItem = { label: string; done: boolean };

function linesToChecklist(text?: string | null): ChecklistItem[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((label) => ({ label, done: false }));
}

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

export async function listInsurers(organizationId: string, activeOnly = true) {
  return db.insurer.findMany({
    where: { organizationId, ...(activeOnly ? { isActive: true } : {}) },
    orderBy: { name: "asc" },
  });
}

export async function getInsurer(organizationId: string, id: string) {
  return db.insurer.findFirst({ where: { id, organizationId } });
}

export async function createInsurer(organizationId: string, data: CreateInsurerInput) {
  return db.insurer.create({
    data: {
      organizationId,
      name: data.name,
      code: data.code || null,
      contactPhone: data.contactPhone || null,
      contactEmail: data.contactEmail || null,
      requiresPreAuthorization: data.requiresPreAuthorization,
      authorizationInstructions: data.authorizationInstructions || null,
      requiredDocuments: data.requiredDocuments || null,
      protocolNotes: data.protocolNotes || null,
      coverageNotes: data.coverageNotes || null,
    },
  });
}

export async function updateInsurer(
  organizationId: string,
  id: string,
  data: CreateInsurerInput & { isActive: boolean }
) {
  const existing = await getInsurer(organizationId, id);
  if (!existing) throw new Error("Aseguradora no encontrada.");

  return db.insurer.update({
    where: { id },
    data: {
      name: data.name,
      code: data.code || null,
      contactPhone: data.contactPhone || null,
      contactEmail: data.contactEmail || null,
      requiresPreAuthorization: data.requiresPreAuthorization,
      authorizationInstructions: data.authorizationInstructions || null,
      requiredDocuments: data.requiredDocuments || null,
      protocolNotes: data.protocolNotes || null,
      coverageNotes: data.coverageNotes || null,
      isActive: data.isActive,
    },
  });
}

// ---------------------------------------------------------------------------
// Seguro por paciente
// ---------------------------------------------------------------------------

/** Liga una aseguradora del catálogo a un paciente, inicializando el checklist
 *  y el estatus de autorización a partir del protocolo de la aseguradora. */
export async function linkPatientInsurance(
  organizationId: string,
  data: { patientId: string; insurerId: string; policyNumber?: string; affiliateNumber?: string }
) {
  const insurer = await getInsurer(organizationId, data.insurerId);
  if (!insurer) throw new Error("La aseguradora no existe en el catálogo.");

  const patient = await db.patient.findFirst({ where: { id: data.patientId, organizationId } });
  if (!patient) throw new Error("Paciente no encontrado.");

  const checklist = linesToChecklist(insurer.requiredDocuments);

  return db.patientInsurance.create({
    data: {
      patientId: data.patientId,
      insurerId: insurer.id,
      insurerName: insurer.name,
      policyNumber: data.policyNumber || null,
      affiliateNumber: data.affiliateNumber || null,
      authorizationStatus: insurer.requiresPreAuthorization ? "PENDING" : "NOT_REQUIRED",
      checklistJson: checklist as unknown as Prisma.InputJsonValue,
    },
  });
}

/** Actualiza el estatus de autorización y el checklist de un seguro del paciente. */
export async function updatePatientInsurance(
  organizationId: string,
  patientInsuranceId: string,
  data: { authorizationStatus: InsuranceAuthStatus; authorizationNumber?: string; checklist: ChecklistItem[] }
) {
  const existing = await db.patientInsurance.findFirst({
    where: { id: patientInsuranceId, patient: { organizationId } },
  });
  if (!existing) throw new Error("Seguro no encontrado.");

  return db.patientInsurance.update({
    where: { id: patientInsuranceId },
    data: {
      authorizationStatus: data.authorizationStatus,
      authorizationNumber: data.authorizationNumber || null,
      checklistJson: data.checklist as unknown as Prisma.InputJsonValue,
    },
  });
}
