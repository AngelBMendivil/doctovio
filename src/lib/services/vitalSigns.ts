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

/**
 * TALLA Y PESO PARA UN DOCUMENTO IMPRESO.
 *
 * No es lo mismo que "la última toma": una receta reimpresa dos años después
 * tiene que seguir diciendo lo que se midió ESE día, no el peso de hoy. Por eso
 * hay dos reglas:
 *
 * 1. Si el documento salió de una consulta, mandan los signos de esa consulta.
 * 2. Lo que falte se completa con la medición previa más reciente —nunca
 *    posterior a la fecha del documento—, porque la talla casi nunca se vuelve
 *    a tomar y dejarla en blanco teniéndola es peor.
 *
 * Cada campo se busca por separado: una toma con peso pero sin talla es lo
 * normal en consulta de seguimiento, y usar la fila completa dejaría la talla
 * vacía teniéndola registrada tres meses antes.
 */
export async function getMeasurementsForDocument(
  organizationId: string,
  patientId: string,
  opts: { consultationId?: string | null; hasta?: Date } = {}
): Promise<{ weightKg: number | null; heightCm: number | null }> {
  const delConsultorio = { patientId, consultation: { organizationId } };

  const deLaConsulta = opts.consultationId
    ? await db.vitalSign.findFirst({
        where: { ...delConsultorio, consultationId: opts.consultationId },
        orderBy: { recordedAt: "desc" },
        select: { weightKg: true, heightCm: true },
      })
    : null;

  const previo = async (campo: "weightKg" | "heightCm") => {
    const fila = await db.vitalSign.findFirst({
      where: {
        ...delConsultorio,
        [campo]: { not: null },
        ...(opts.hasta ? { recordedAt: { lte: opts.hasta } } : {}),
      },
      orderBy: { recordedAt: "desc" },
      select: { weightKg: true, heightCm: true },
    });
    return fila?.[campo] ?? null;
  };

  return {
    weightKg: deLaConsulta?.weightKg ?? (await previo("weightKg")),
    heightCm: deLaConsulta?.heightCm ?? (await previo("heightCm")),
  };
}
