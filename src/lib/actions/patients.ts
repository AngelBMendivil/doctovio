"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { assertPermission } from "@/lib/auth/rbac";
import { createPatientSchema, quickAdmitPatientSchema } from "@/lib/validations/patient";
import { createPatient, quickAdmitPatient, findPossibleDuplicates, archivePatient, updatePatientGeneral } from "@/lib/services/patients";

export type ActionState = { error?: string; fieldErrors?: Record<string, string[]> };

export async function checkDuplicatesAction(formData: FormData) {
  const session = await requireSession();
  const results = await findPossibleDuplicates(session.organizationId, {
    firstName: String(formData.get("firstName") || ""),
    lastName1: String(formData.get("lastName1") || ""),
    phone: String(formData.get("phone") || "") || undefined,
    email: String(formData.get("email") || "") || undefined,
    curp: String(formData.get("curp") || "") || undefined,
  });
  return results;
}

export async function createPatientAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession();
  assertPermission(session.role, "CREATE_PATIENT");

  const raw = Object.fromEntries(formData.entries());
  const parsed = createPatientSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: "Revisa los campos marcados.", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const patient = await createPatient(session.organizationId, session.userId, parsed.data);
  revalidatePath("/patients");
  redirect(`/patients/${patient.id}`);
}

/** Actualiza datos generales del paciente desde la consulta. Solo Admin o Médico. */
export async function updatePatientGeneralAction(formData: FormData) {
  const session = await requireSession();
  if (session.role !== "ADMIN" && session.role !== "DOCTOR") {
    throw new Error("No tienes permiso para editar datos del paciente.");
  }
  const patientId = String(formData.get("patientId") || "");
  const consultationId = String(formData.get("consultationId") || "");
  const birthDate = new Date(String(formData.get("birthDate") || ""));
  if (isNaN(birthDate.getTime())) throw new Error("Fecha de nacimiento inválida.");

  await updatePatientGeneral(session.organizationId, session.userId, patientId, {
    firstName: String(formData.get("firstName") || "").trim(),
    lastName1: String(formData.get("lastName1") || "").trim(),
    lastName2: String(formData.get("lastName2") || ""),
    birthDate,
    sex: String(formData.get("sex") || "UNDETERMINED"),
    phone: String(formData.get("phone") || ""),
    email: String(formData.get("email") || ""),
    occupation: String(formData.get("occupation") || ""),
    maritalStatus: String(formData.get("maritalStatus") || ""),
    address: String(formData.get("address") || ""),
    city: String(formData.get("city") || ""),
    state: String(formData.get("state") || ""),
    curp: String(formData.get("curp") || ""),
    bloodType: String(formData.get("bloodType") || ""),
  });

  if (consultationId) revalidatePath(`/consultations/${consultationId}`);
  revalidatePath(`/patients/${patientId}`);
}

/** Da de baja (archiva) un paciente. Solo Admin o Médico. */
export async function archivePatientAction(formData: FormData) {
  const session = await requireSession();
  if (session.role !== "ADMIN" && session.role !== "DOCTOR") {
    throw new Error("No tienes permiso para dar de baja pacientes.");
  }
  const patientId = String(formData.get("patientId") || "");
  if (!patientId) throw new Error("Falta el paciente.");
  await archivePatient(session.organizationId, session.userId, patientId);
  revalidatePath("/patients");
}

export async function quickAdmitPatientAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.role, "CREATE_PATIENT");

  const raw = Object.fromEntries(formData.entries());
  const parsed = quickAdmitPatientSchema.parse(raw);
  const patient = await quickAdmitPatient(session.organizationId, session.userId, parsed);
  revalidatePath("/waiting-room");
  return patient;
}
