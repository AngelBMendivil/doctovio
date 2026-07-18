"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireSession } from "@/lib/auth/session";
import { assertPermission } from "@/lib/auth/rbac";
import { updateConsultationSchema, vitalSignSchema, diagnosisSchema } from "@/lib/validations/consultation";
import { updateConsultationDraft, finalizeConsultation, addConsultationAddendum } from "@/lib/services/consultations";
import { recordVitalSigns } from "@/lib/services/vitalSigns";
import { createDiagnosis } from "@/lib/services/diagnoses";

export async function updateConsultationAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.role, "START_CONSULTATION");
  const parsed = updateConsultationSchema.parse(Object.fromEntries(formData.entries()));
  const { consultationId, ...data } = parsed;
  await updateConsultationDraft(session.organizationId, session.userId, consultationId, data);
  revalidatePath(`/consultations/${consultationId}`);
}

export type ActionState = { ok: boolean; message: string } | null;

/** Nombres de campo legibles: "systolicPressure" no le dice nada a nadie. */
const FIELD_LABELS: Record<string, string> = {
  weightKg: "Peso",
  heightCm: "Talla",
  temperatureC: "Temperatura",
  systolicPressure: "TA sistólica",
  diastolicPressure: "TA diastólica",
  heartRate: "Frecuencia cardiaca",
  respiratoryRate: "Frecuencia respiratoria",
  oxygenSaturation: "SpO2",
  glucose: "Glucosa",
  painScale: "Escala de dolor",
  label: "Diagnóstico",
  code: "Código",
};

/**
 * Convierte cualquier error en un mensaje para el médico.
 *
 * Antes estas acciones lanzaban el ZodError crudo: Next tumbaba la pantalla,
 * no se guardaba nada, y se perdía todo lo capturado en las demás pestañas.
 * Un dato fuera de rango es un error del usuario, no una falla del sistema.
 */
function toState(error: unknown): ActionState {
  if (error instanceof ZodError) {
    const issues = error.issues.slice(0, 3).map((i) => {
      const field = FIELD_LABELS[String(i.path[0])] ?? String(i.path[0]);
      return `${field}: ${i.message}`;
    });
    return { ok: false, message: `Revisa los datos. ${issues.join(" · ")}` };
  }
  if (error instanceof Error) {
    if (error.message.startsWith("FORBIDDEN")) {
      return { ok: false, message: "No tienes permiso para realizar esta acción." };
    }
    return { ok: false, message: error.message };
  }
  return { ok: false, message: "Ocurrió un error inesperado." };
}

export async function recordVitalSignsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    assertPermission(session.role, "RECORD_VITAL_SIGNS");
    const parsed = vitalSignSchema.parse(Object.fromEntries(formData.entries()));
    await recordVitalSigns(session.userId, parsed);
    revalidatePath(`/consultations/${parsed.consultationId}`);
    return { ok: true, message: "Signos vitales guardados." };
  } catch (e) {
    return toState(e);
  }
}

export async function createDiagnosisAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    assertPermission(session.role, "RECORD_DIAGNOSIS");
    const parsed = diagnosisSchema.parse(Object.fromEntries(formData.entries()));
    await createDiagnosis(session.organizationId, session.userId, parsed);
    revalidatePath(`/consultations/${parsed.consultationId}`);
    return { ok: true, message: "Diagnóstico agregado." };
  } catch (e) {
    return toState(e);
  }
}

export async function finalizeConsultationAction(consultationId: string) {
  const session = await requireSession();
  assertPermission(session.role, "FINALIZE_CONSULTATION"); // solo DOCTOR
  await finalizeConsultation(session.organizationId, session.userId, consultationId);
  revalidatePath(`/consultations/${consultationId}`);
  revalidatePath("/waiting-room");
}

export async function addAddendumAction(formData: FormData) {
  const session = await requireSession();
  const consultationId = String(formData.get("consultationId"));
  const note = String(formData.get("note"));
  await addConsultationAddendum(session.organizationId, session.userId, consultationId, note);
  revalidatePath(`/consultations/${consultationId}`);
}
