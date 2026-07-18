import { db } from "@/lib/db";
import { calculateBMI } from "@/lib/utils/bmi";
import type { vitalSignSchema } from "@/lib/validations/consultation";
import type { z } from "zod";

type VitalSignInput = z.infer<typeof vitalSignSchema>;

/** Los signos vitales conservan historial: cada captura es un registro nuevo, nunca se sobrescribe. */
export async function recordVitalSigns(userId: string, input: VitalSignInput) {
  const bmi = calculateBMI(input.weightKg, input.heightCm);

  return db.vitalSign.create({
    data: {
      consultationId: input.consultationId,
      patientId: input.patientId,
      weightKg: input.weightKg,
      heightCm: input.heightCm,
      bmi: bmi ?? undefined,
      temperatureC: input.temperatureC,
      systolicPressure: input.systolicPressure,
      diastolicPressure: input.diastolicPressure,
      heartRate: input.heartRate,
      respiratoryRate: input.respiratoryRate,
      oxygenSaturation: input.oxygenSaturation,
      glucose: input.glucose,
      painScale: input.painScale,
      observations: input.observations || null,
      recordedById: userId,
    },
  });
}

export async function getLatestVitalSigns(patientId: string) {
  return db.vitalSign.findFirst({ where: { patientId }, orderBy: { recordedAt: "desc" } });
}
