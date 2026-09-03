import { db } from "@/lib/db";
import { calculateBMI } from "@/lib/utils/bmi";
import type { vitalSignSchema } from "@/lib/validations/consultation";
import type { z } from "zod";

type VitalSignInput = z.infer<typeof vitalSignSchema>;

/**
 * SIGNOS VITALES.
 *
 * Ambas funciones exigen `organizationId`, y no es formalidad: la acción que
 * las llama toma `patientId` y `consultationId` DIRECTO del formulario. Sin
 * este filtro, un usuario de un consultorio podía mandar el formulario con los
 * ids de otro y escribir presión arterial o glucosa falsas en el expediente de
 * un paciente ajeno. Eso no es una fuga de lectura: es corrupción de datos
 * clínicos de terceros.
 *
 * Nunca aceptes un `patientId` de la interfaz sin comprobar a qué consultorio
 * pertenece.
 */

/** Los signos vitales conservan historial: cada captura es un registro nuevo, nunca se sobrescribe. */
export async function recordVitalSigns(
  organizationId: string,
  userId: string,
  input: VitalSignInput
) {
  // La consulta Y el paciente deben ser de este consultorio. Se comprueban las
  // dos cosas: con solo una, bastaría cruzar un id propio con otro ajeno.
  const consulta = await db.consultation.findFirst({
    where: { id: input.consultationId, organizationId, patientId: input.patientId },
    select: { id: true },
  });

  if (!consulta) {
    throw new Error("La consulta no existe en este consultorio, o no corresponde a ese paciente.");
  }

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

/** Última toma del paciente, siempre acotada al consultorio. */
export async function getLatestVitalSigns(organizationId: string, patientId: string) {
  return db.vitalSign.findFirst({
    // VitalSign no lleva organizationId propio: cuelga de la CONSULTA, que sí
    // lo tiene. Filtrar por esa relación es igual de estricto y evita duplicar
    // el dato en otra columna que habría que mantener sincronizada.
    where: { patientId, consultation: { organizationId } },
    orderBy: { recordedAt: "desc" },
  });
}
