import { db } from "@/lib/db";
import { logAudit } from "@/lib/services/audit";
import type { diagnosisSchema } from "@/lib/validations/consultation";
import type { z } from "zod";
import { assertConsultationInClinic } from "@/lib/services/tenant-guard";

type DiagnosisInput = z.infer<typeof diagnosisSchema>;

/** Solo el médico registra diagnósticos (verificado en la capa de Server Action con RBAC). */
export async function createDiagnosis(organizationId: string, doctorId: string, input: DiagnosisInput) {
  // Los ids vienen del formulario. Un diagnostico es una afirmacion clinica
  // formal: escribirlo en la consulta de otro consultorio es de lo peor que
  // puede pasar en un expediente.
  await assertConsultationInClinic(organizationId, input.consultationId, input.patientId);

  const diagnosis = await db.diagnosis.create({
    data: {
      consultationId: input.consultationId,
      patientId: input.patientId,
      doctorId,
      label: input.label,
      type: input.type,
      code: input.code || null,
      description: input.description || null,
    },
  });

  await logAudit({ organizationId, userId: doctorId, action: "CREATE", entity: "diagnosis", entityId: diagnosis.id, newValues: diagnosis });
  return diagnosis;
}
