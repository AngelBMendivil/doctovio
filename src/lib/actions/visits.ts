"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { assertPermission, hasPermission } from "@/lib/auth/rbac";
import { createVisitSchema } from "@/lib/validations/visit";
import { quickAdmitPatientSchema } from "@/lib/validations/patient";
import { createVisit, updateVisitStatus } from "@/lib/services/visits";
import { quickAdmitPatient } from "@/lib/services/patients";
import { startConsultation } from "@/lib/services/consultations";
import { db } from "@/lib/db";

/** "Agregar paciente sin cita": alta rápida + entra directo a sala de espera (entidad visits). */
export async function addWalkInPatientAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.role, "MANAGE_WAITING_ROOM");

  const existingPatientId = String(formData.get("existingPatientId") || "");

  let patientId = existingPatientId;
  if (!patientId) {
    const parsed = quickAdmitPatientSchema.parse(Object.fromEntries(formData.entries()));
    const patient = await quickAdmitPatient(session.organizationId, session.userId, parsed);
    patientId = patient.id;
  }

  const doctorId = String(formData.get("doctorId") || "");
  const reason = String(formData.get("reason") || "");
  const priority = (String(formData.get("priority") || "NORMAL")) as "NORMAL" | "HIGH" | "URGENT";

  const parsedVisit = createVisitSchema.parse({
    patientId,
    doctorId,
    reason,
    priority,
    arrivalType: "WITHOUT_APPOINTMENT",
  });

  await createVisit(session.organizationId, session.userId, parsedVisit);
  revalidatePath("/waiting-room");
}

export async function registerArrivalAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.role, "REGISTER_ARRIVAL");

  const appointmentId = String(formData.get("appointmentId"));
  const appointment = await db.appointment.findFirstOrThrow({
    where: { id: appointmentId, organizationId: session.organizationId },
    include: {
      publicFormTokens: { where: { type: "PRE_REGISTRATION" }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  // Un paciente de primera vez no puede pasar sin prerregistro completo,
  // salvo que el usuario tenga el privilegio (Admin/Médico).
  if (appointment.type === "FIRST_TIME") {
    const token = appointment.publicFormTokens[0];
    const preRegDone = token && (token.status === "SUBMITTED" || token.status === "CONVERTED");
    if (!preRegDone && !hasPermission(session.role, "OVERRIDE_PREREGISTRATION")) {
      throw new Error("Este paciente de primera vez aún no completa su prerregistro.");
    }
  }

  const parsed = createVisitSchema.parse({
    patientId: appointment.patientId,
    doctorId: appointment.doctorId,
    appointmentId: appointment.id,
    branchId: appointment.branchId ?? undefined,
    arrivalType: "WITH_APPOINTMENT",
    priority: "NORMAL",
  });

  await createVisit(session.organizationId, session.userId, parsed);
  revalidatePath("/waiting-room");
}

export async function markVisitLeftAction(visitId: string) {
  const session = await requireSession();
  assertPermission(session.role, "MANAGE_WAITING_ROOM");
  await updateVisitStatus(session.organizationId, session.userId, visitId, "LEFT");
  revalidatePath("/waiting-room");
}

/** Solo médico/admin puede iniciar consulta (visita -> consulta). */
export async function startConsultationAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.role, "START_CONSULTATION");

  const visitId = String(formData.get("visitId"));
  const visit = await db.visit.findFirstOrThrow({ where: { id: visitId, organizationId: session.organizationId } });

  const consultation = await startConsultation(session.organizationId, session.userId, {
    visitId: visit.id,
    patientId: visit.patientId,
    doctorId: visit.doctorId,
    appointmentId: visit.appointmentId ?? undefined,
    reason: visit.reason ?? undefined,
  });

  redirect(`/consultations/${consultation.id}`);
}
