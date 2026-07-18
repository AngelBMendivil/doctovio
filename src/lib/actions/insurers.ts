"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireSession } from "@/lib/auth/session";
import { assertPermission } from "@/lib/auth/rbac";
import { createInsurerSchema, updateInsurerSchema, linkInsuranceSchema, authStatusEnum } from "@/lib/validations/insurer";
import { createInsurer, updateInsurer, linkPatientInsurance, updatePatientInsurance, type ChecklistItem } from "@/lib/services/insurers";

export type ActionState = { ok: boolean; message: string } | null;

function toState(error: unknown): ActionState {
  if (error instanceof ZodError) {
    const first = error.issues[0];
    return { ok: false, message: first?.message ?? "Revisa los campos." };
  }
  if (error instanceof Error) {
    if (error.message.startsWith("FORBIDDEN")) return { ok: false, message: "No tienes permiso para esta acción." };
    return { ok: false, message: error.message };
  }
  return { ok: false, message: "Ocurrió un error inesperado." };
}

/** CONSULTORIO: crea una aseguradora en el catálogo (admin). */
export async function createInsurerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    assertPermission(session.role, "MANAGE_CATALOGS");

    const data = createInsurerSchema.parse(Object.fromEntries(formData.entries()));
    await createInsurer(session.organizationId, data);

    revalidatePath("/settings");
    return { ok: true, message: `Aseguradora "${data.name}" guardada satisfactoriamente.` };
  } catch (e) {
    return toState(e);
  }
}

/** CONSULTORIO: edita una aseguradora del catálogo (admin).
 *  En éxito regresa al catálogo (pantalla principal). */
export async function updateInsurerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    assertPermission(session.role, "MANAGE_CATALOGS");

    const { id, ...data } = updateInsurerSchema.parse(Object.fromEntries(formData.entries()));
    await updateInsurer(session.organizationId, id, data);

    revalidatePath("/insurers");
    revalidatePath(`/insurers/${id}`);
  } catch (e) {
    return toState(e);
  }
  // Fuera del try/catch: redirect() lanza NEXT_REDIRECT y no debe capturarse.
  redirect("/insurers");
}

/** CONSULTORIO: liga una aseguradora del catálogo a un paciente. */
export async function linkInsuranceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    assertPermission(session.role, "EDIT_PATIENT_GENERAL");

    const data = linkInsuranceSchema.parse(Object.fromEntries(formData.entries()));
    await linkPatientInsurance(session.organizationId, data);

    revalidatePath(`/patients/${data.patientId}`);
    return { ok: true, message: "Seguro ligado al paciente satisfactoriamente." };
  } catch (e) {
    return toState(e);
  }
}

/** CONSULTORIO: actualiza estatus de autorización y checklist del seguro. */
export async function updateInsuranceStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    assertPermission(session.role, "EDIT_PATIENT_GENERAL");

    const patientInsuranceId = String(formData.get("patientInsuranceId") || "");
    const patientId = String(formData.get("patientId") || "");
    const authorizationStatus = authStatusEnum.parse(formData.get("authorizationStatus"));
    const authorizationNumber = String(formData.get("authorizationNumber") || "");

    // Reconstruye el checklist: por cada item se envía su label y si está marcado.
    const labels = formData.getAll("checklistLabel").map((v) => String(v));
    const checklist: ChecklistItem[] = labels.map((label, i) => ({
      label,
      done: formData.get(`checklistDone_${i}`) === "on",
    }));

    await updatePatientInsurance(session.organizationId, patientInsuranceId, {
      authorizationStatus,
      authorizationNumber,
      checklist,
    });

    revalidatePath(`/patients/${patientId}`);
    return { ok: true, message: "Seguimiento del seguro actualizado satisfactoriamente." };
  } catch (e) {
    return toState(e);
  }
}
