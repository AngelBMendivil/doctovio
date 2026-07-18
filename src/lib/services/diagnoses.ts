import { db } from "@/lib/db";
import { logAudit } from "@/lib/services/audit";
import type { diagnosisSchema } from "@/lib/validations/consultation";
import type { z } from "zod";

type DiagnosisInput = z.infer<typeof diagnosisSchema>;

/** Solo el médico registra diagnósticos (verificado en la capa de Server Action con RBAC). */
export async function createDiagnosis(organizationId: string, doctorId: string, input: DiagnosisInput) {
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
