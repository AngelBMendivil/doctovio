import { db } from "@/lib/db";
import { logAudit } from "@/lib/services/audit";
import { sendNotification } from "@/lib/services/notifications";
import { calculateAge } from "@/lib/utils/age";
import type { CreateReferralInput } from "@/lib/validations/referral";

const SHAREABLE_FIELDS: Record<string, string> = {
  name: "Nombre",
  age: "Edad",
  sex: "Sexo",
  blood_type: "Tipo de sangre",
  allergies: "Alergias",
  chronic_conditions: "Enfermedades crónicas",
  current_medications: "Medicamentos actuales",
  relevant_history: "Antecedentes relevantes",
  diagnosis: "Diagnóstico relacionado",
  reason: "Motivo de referencia",
  treatment: "Tratamiento actual",
  recommended_studies: "Estudios recomendados",
};

/** Construye el valor textual de cada campo compartible a partir del expediente, en el momento del envío. */
async function buildSharedSnapshot(patientId: string, fieldKeys: string[], extra: { diagnosisText?: string; treatmentText?: string; studiesText?: string }) {
  const patient = await db.patient.findUniqueOrThrow({
    where: { id: patientId },
    include: {
      medicalProfile: true,
      allergies: { where: { isActive: true } },
      chronicConditions: { where: { isActive: true } },
      currentMedications: { where: { isActive: true } },
    },
  });

  const valueForKey = (key: string): string | null => {
    switch (key) {
      case "name":
        return [patient.firstName, patient.lastLastName, patient.secondLastName].filter(Boolean).join(" ");
      case "age":
        return String(calculateAge(patient.birthDate));
      case "sex":
        return patient.sex;
      case "blood_type":
        return patient.medicalProfile?.bloodType ?? null;
      case "allergies":
        return patient.allergies.map((a) => a.substance).join(", ") || "Sin registro";
      case "chronic_conditions":
        return patient.chronicConditions.map((c) => c.name).join(", ") || "Sin registro";
      case "current_medications":
        return patient.currentMedications.map((m) => `${m.name} ${m.dose ?? ""}`).join(", ") || "Sin registro";
      case "relevant_history":
        return patient.medicalProfile?.relevantConditions ?? "Sin registro";
      case "diagnosis":
        return extra.diagnosisText ?? "No especificado";
      case "treatment":
        return extra.treatmentText ?? "No especificado";
      case "recommended_studies":
        return extra.studiesText ?? "No especificado";
      default:
        return null;
    }
  };

  return fieldKeys
    .map((key) => ({ fieldKey: key, fieldLabel: SHAREABLE_FIELDS[key] ?? key, valueText: valueForKey(key) ?? "" }))
    .filter((item) => item.fieldLabel);
}

export async function createAndSendReferral(
  organizationFromId: string,
  fromDoctorId: string,
  input: CreateReferralInput & { diagnosisText?: string; treatmentText?: string; studiesText?: string }
) {
  const toDoctor = await db.user.findFirstOrThrow({
    where: { id: input.toDoctorId, primaryRole: "DOCTOR", isActive: true },
  });

  const snapshot = await buildSharedSnapshot(input.patientId, input.sharedFieldKeys, {
    diagnosisText: input.diagnosisText,
    treatmentText: input.treatmentText,
    studiesText: input.studiesText,
  });

  const referral = await db.$transaction(async (tx) => {
    const created = await tx.medicalReferral.create({
      data: {
        organizationFromId,
        organizationToId: toDoctor.organizationId,
        patientId: input.patientId,
        fromDoctorId,
        toDoctorId: toDoctor.id,
        reason: input.reason,
        priority: input.priority,
        status: "SENT",
        patientAuthorized: input.patientAuthorized,
        patientAuthorizedAt: input.patientAuthorized ? new Date() : null,
        accessExpiresAt: new Date(Date.now() + input.accessDays * 24 * 60 * 60 * 1000),
        referentComments: input.referentComments || null,
        sentAt: new Date(),
        sharedItems: { create: snapshot },
      },
      include: { sharedItems: true, patient: true, fromDoctor: { include: { doctorProfile: true } } },
    });

    await tx.referralAccessLog.create({
      data: { referralId: created.id, userId: fromDoctorId, action: "sent" },
    });

    return created;
  });

  await logAudit({
    organizationId: organizationFromId,
    userId: fromDoctorId,
    action: "SEND",
    entity: "medical_referral",
    entityId: referral.id,
    newValues: { toDoctorId: toDoctor.id, sharedFields: input.sharedFieldKeys },
  });

  const patientLabel = `${referral.patient.firstName} ${referral.patient.lastLastName}`;
  if (toDoctor.email) {
    await sendNotification({
      organizationId: toDoctor.organizationId,
      type: "REFERRAL_RECEIVED",
      to: toDoctor.email,
      subject: "Nueva referencia médica recibida",
      template: "referralReceived",
      templateParams: {
        toDoctorName: toDoctor.fullName,
        fromDoctorName: referral.fromDoctor.fullName,
        fromOrganization: organizationFromId,
        patientLabel,
        reason: input.reason,
      },
      relatedEntity: "medical_referral",
      relatedId: referral.id,
    });
  }

  return referral;
}

/** El médico receptor solo ve el resumen autorizado (sharedItems), nunca el expediente completo. */
export async function getReferralSummaryForReceiver(referralId: string, viewerUserId: string, ip?: string, userAgent?: string) {
  const referral = await db.medicalReferral.findFirstOrThrow({
    where: { id: referralId, toDoctorId: viewerUserId },
    include: {
      sharedItems: true,
      fromDoctor: { include: { doctorProfile: true } },
      organizationFrom: true,
      response: true,
    },
  });

  await db.referralAccessLog.create({
    data: { referralId, userId: viewerUserId, action: "viewed_summary", ipAddress: ip, userAgent },
  });

  return referral;
}

export async function respondToReferralStatus(
  organizationId: string,
  doctorId: string,
  referralId: string,
  status: "ACCEPTED" | "REJECTED"
) {
  const referral = await db.medicalReferral.findFirstOrThrow({ where: { id: referralId, toDoctorId: doctorId } });

  const updated = await db.$transaction(async (tx) => {
    const upd = await tx.medicalReferral.update({
      where: { id: referralId },
      data: { status, respondedAt: new Date() },
    });
    await tx.referralAccessLog.create({ data: { referralId, userId: doctorId, action: status.toLowerCase() } });
    return upd;
  });

  const fromDoctor = await db.user.findUnique({ where: { id: referral.fromDoctorId } });
  const toDoctor = await db.user.findUnique({ where: { id: doctorId } });
  const patient = await db.patient.findUnique({ where: { id: referral.patientId } });

  if (fromDoctor?.email && toDoctor && patient) {
    await sendNotification({
      organizationId: referral.organizationFromId,
      type: status === "ACCEPTED" ? "REFERRAL_ACCEPTED" : "REFERRAL_REJECTED",
      to: fromDoctor.email,
      subject: status === "ACCEPTED" ? "Tu referencia fue aceptada" : "Tu referencia fue rechazada",
      template: status === "ACCEPTED" ? "referralAccepted" : "referralRejected",
      templateParams: {
        fromDoctorName: fromDoctor.fullName,
        toDoctorName: toDoctor.fullName,
        patientLabel: `${patient.firstName} ${patient.lastLastName}`,
      },
      relatedEntity: "medical_referral",
      relatedId: referralId,
    });
  }

  return updated;
}

export async function submitReferralResponse(
  organizationId: string,
  doctorId: string,
  referralId: string,
  data: {
    attendedConfirmed: boolean;
    generalAssessment?: string;
    generalDiagnosis?: string;
    recommendations?: string;
    followUp?: string;
    requestsReturn: boolean;
    comments?: string;
  }
) {
  return db.$transaction(async (tx) => {
    const response = await tx.referralResponse.upsert({
      where: { referralId },
      update: { ...data, attendedAt: data.attendedConfirmed ? new Date() : null },
      create: { referralId, ...data, attendedAt: data.attendedConfirmed ? new Date() : null },
    });
    await tx.medicalReferral.update({ where: { id: referralId }, data: { status: "ATTENDED" } });
    await tx.referralAccessLog.create({ data: { referralId, userId: doctorId, action: "responded" } });
    return response;
  });
}

export async function closeReferral(organizationId: string, userId: string, referralId: string) {
  return db.$transaction(async (tx) => {
    const updated = await tx.medicalReferral.update({
      where: { id: referralId },
      data: { status: "CLOSED", closedAt: new Date() },
    });
    await tx.referralAccessLog.create({ data: { referralId, userId, action: "closed" } });
    return updated;
  });
}

export async function listInboxReferrals(doctorId: string) {
  return db.medicalReferral.findMany({
    where: { toDoctorId: doctorId },
    include: { patient: true, fromDoctor: true, organizationFrom: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function listSentReferrals(doctorId: string) {
  return db.medicalReferral.findMany({
    where: { fromDoctorId: doctorId },
    include: { patient: true, toDoctor: true, organizationTo: true, response: true },
    orderBy: { createdAt: "desc" },
  });
}

export { SHAREABLE_FIELDS };
