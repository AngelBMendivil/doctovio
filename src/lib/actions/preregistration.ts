"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireSession } from "@/lib/auth/session";
import { assertPermission } from "@/lib/auth/rbac";
import { preRegistrationSchema } from "@/lib/validations/preregistration";
import { bookFirstTimeSchema } from "@/lib/validations/appointment";
import {
  createPreRegistrationToken,
  submitPreRegistration,
  convertPreRegistrationToPatient,
  bookFirstTimeIntake,
  getOrCreateAppointmentPreRegToken,
  DuplicatePatientError,
  NEGATED,
} from "@/lib/services/preregistration";

export type ActionState = { ok: boolean; message: string } | null;

function toState(error: unknown): ActionState {
  if (error instanceof ZodError) {
    const first = error.issues[0];
    return { ok: false, message: first?.message ?? "Revisa los campos del formulario." };
  }
  if (error instanceof Error) return { ok: false, message: error.message };
  return { ok: false, message: "Ocurrió un error inesperado." };
}

/** PÚBLICO: el paciente envía su prerregistro (sin sesión). */
export async function submitPreRegistrationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const token = String(formData.get("token") || "");
    if (!token) return { ok: false, message: "Enlace inválido." };

    const raw: Record<string, unknown> = Object.fromEntries(formData.entries());

    // Las alergias se capturan como checklist (varias casillas) + un campo "Otras".
    // Se combinan en el campo `allergies` (una por línea) que espera el esquema.
    //
    // "NEGADAS" no es adorno: distingue "el paciente declaró no tener alergias"
    // de "el paciente no llenó esa parte". Un vacío ambiguo en alergias es
    // justo lo que no debe llegarle al médico al recetar.
    if (formData.get("noAllergies") === "on") {
      raw.allergies = NEGATED;
    } else {
      const commonAllergies = formData.getAll("allergyCommon").map((v) => String(v));
      const otherAllergies = String(formData.get("allergiesOther") || "");
      raw.allergies = [...commonAllergies, ...otherAllergies.split(/\r?\n/)]
        .map((s) => s.trim())
        .filter(Boolean)
        .join("\n");
    }

    // Enfermedades crónicas: checklist + campo "Otras" -> `chronicConditions`.
    if (formData.get("noChronic") === "on") {
      raw.chronicConditions = NEGATED;
    } else {
      const commonChronic = formData.getAll("chronicCommon").map((v) => String(v));
      const otherChronic = String(formData.get("chronicOther") || "");
      raw.chronicConditions = [...commonChronic, ...otherChronic.split(/\r?\n/)]
        .map((s) => s.trim())
        .filter(Boolean)
        .join("\n");
    }

    // Antecedentes familiares. Si el paciente declaró "ninguno", se limpia todo
    // lo demás en el servidor: las casillas están deshabilitadas en pantalla,
    // pero el candado real va aquí, no en la interfaz.
    if (formData.get("noFamily") === "on") {
      raw.familyDiabetes = false;
      raw.familyHypertension = false;
      raw.familyCancer = false;
      raw.familyHeartDisease = false;
      raw.familyHereditaryDisease = false;
      raw.familyCancerTypes = "";
      raw.familyOthers = "";
    } else {
      // Tipos de cáncer familiar (checklist condicional) -> `familyCancerTypes`.
      raw.familyCancerTypes = formData
        .getAll("familyCancerType")
        .map((v) => String(v).trim())
        .filter(Boolean)
        .join(", ");
    }

    // Otras sustancias (checklist condicional + "otras") -> `substanceUse`.
    const commonSubstances = formData.getAll("substanceCommon").map((v) => String(v));
    const otherSubstances = String(formData.get("substanceOther") || "");
    raw.substanceUse = [...commonSubstances, ...otherSubstances.split(/\r?\n/)]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(", ");

    const data = preRegistrationSchema.parse(raw);
    await submitPreRegistration(token, data);

    return { ok: true, message: "¡Gracias! Recibimos tus datos correctamente." };
  } catch (e) {
    return toState(e);
  }
}

/** CONSULTORIO: genera un enlace de prerregistro y devuelve la URL. */
export async function generatePreRegLinkAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    assertPermission(session.role, "CREATE_PATIENT");

    const created = await createPreRegistrationToken(session.organizationId);
    const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const url = `${base}/public/prerregistro/${created.token}`;

    revalidatePath("/preregistrations");
    return { ok: true, message: url };
  } catch (e) {
    return toState(e);
  }
}

/** CONSULTORIO: agenda a un paciente de primera vez y devuelve el enlace de prerregistro. */
export async function bookFirstTimeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    assertPermission(session.role, "CREATE_PATIENT");
    assertPermission(session.role, "MANAGE_APPOINTMENTS");

    const scheduledDate = String(formData.get("scheduledDate") || "");
    const hour = String(formData.get("hour") || "00");
    const minute = String(formData.get("minute") || "00");
    const data = bookFirstTimeSchema.parse({
      ...Object.fromEntries(formData.entries()),
      startTime: `${scheduledDate}T${hour}:${minute}:00`,
    });
    const { token } = await bookFirstTimeIntake(session.organizationId, session.userId, data);

    const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const url = `${base}/public/prerregistro/${token}`;

    revalidatePath("/appointments");
    revalidatePath("/preregistrations");
    revalidatePath("/waiting-room");
    return { ok: true, message: url };
  } catch (e) {
    // Un duplicado no es un error del sistema: es una decisión que le toca a
    // recepción. Se le devuelven los candidatos para que elija.
    if (e instanceof DuplicatePatientError) {
      return {
        ok: false,
        message:
          `Ya existe un expediente con estos datos: ${e.matches
            .map((m) => `${m.fullName} (${m.recordNumber})`)
            .join(", ")}. ` +
          `Selecciónalo en la búsqueda de arriba, o marca "Es otra persona" si estás seguro de que es distinto.`,
      };
    }
    return toState(e);
  }
}

/** CONSULTORIO: asegura el enlace de prerregistro de una cita (crea el token si falta). */
export async function ensureAppointmentPreRegAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.role, "CREATE_PATIENT");
  const appointmentId = String(formData.get("appointmentId") || "");
  if (!appointmentId) throw new Error("Falta la cita.");
  await getOrCreateAppointmentPreRegToken(session.organizationId, appointmentId);
  revalidatePath("/waiting-room");
}

/** CONSULTORIO: convierte un prerregistro en expediente y redirige al paciente. */
export async function convertPreRegistrationAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.role, "CREATE_PATIENT");

  const id = String(formData.get("id") || "");
  if (!id) throw new Error("Falta el identificador del prerregistro.");

  const patient = await convertPreRegistrationToPatient(session.organizationId, session.userId, id);

  revalidatePath("/preregistrations");
  redirect(`/patients/${patient.id}`);
}
