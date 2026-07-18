"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { assertPermission } from "@/lib/auth/rbac";
import { createReferralSchema, referralResponseSchema } from "@/lib/validations/referral";
import { createAndSendReferral, respondToReferralStatus, submitReferralResponse, closeReferral } from "@/lib/services/referrals";

export async function sendReferralAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.role, "SEND_REFERRAL"); // médico o admin, nunca asistente

  const sharedFieldKeys = formData.getAll("sharedFieldKeys").map(String);

  const parsed = createReferralSchema.parse({
    patientId: String(formData.get("patientId")),
    toDoctorId: String(formData.get("toDoctorId")),
    reason: String(formData.get("reason")),
    priority: String(formData.get("priority") || "NORMAL"),
    referentComments: String(formData.get("referentComments") || ""),
    accessDays: String(formData.get("accessDays") || "30"),
    patientAuthorized: formData.get("patientAuthorized") === "on",
    sharedFieldKeys,
  });

  await createAndSendReferral(session.organizationId, session.userId, {
    ...parsed,
    diagnosisText: String(formData.get("diagnosisText") || ""),
    treatmentText: String(formData.get("treatmentText") || ""),
    studiesText: String(formData.get("studiesText") || ""),
  });

  revalidatePath("/referrals");
}

export async function acceptReferralAction(referralId: string) {
  const session = await requireSession();
  assertPermission(session.role, "RESPOND_REFERRAL");
  await respondToReferralStatus(session.organizationId, session.userId, referralId, "ACCEPTED");
  revalidatePath(`/referrals/${referralId}`);
}

export async function rejectReferralAction(referralId: string) {
  const session = await requireSession();
  assertPermission(session.role, "RESPOND_REFERRAL");
  await respondToReferralStatus(session.organizationId, session.userId, referralId, "REJECTED");
  revalidatePath(`/referrals/${referralId}`);
}

export async function submitReferralResponseAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.role, "RESPOND_REFERRAL");
  const referralId = String(formData.get("referralId"));
  const parsed = referralResponseSchema.parse({
    referralId,
    attendedConfirmed: formData.get("attendedConfirmed") === "on",
    generalAssessment: String(formData.get("generalAssessment") || ""),
    generalDiagnosis: String(formData.get("generalDiagnosis") || ""),
    recommendations: String(formData.get("recommendations") || ""),
    followUp: String(formData.get("followUp") || ""),
    requestsReturn: formData.get("requestsReturn") === "on",
    comments: String(formData.get("comments") || ""),
  });
  const { referralId: _id, ...data } = parsed;
  await submitReferralResponse(session.organizationId, session.userId, referralId, data);
  revalidatePath(`/referrals/${referralId}`);
}

export async function closeReferralAction(referralId: string) {
  const session = await requireSession();
  await closeReferral(session.organizationId, session.userId, referralId);
  revalidatePath(`/referrals/${referralId}`);
}
