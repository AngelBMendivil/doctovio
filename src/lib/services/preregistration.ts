import { db } from "@/lib/db";
import { generateSecureToken } from "@/lib/utils/tokens";
import { logAudit } from "@/lib/services/audit";
import { getInsurer, linkPatientInsurance } from "@/lib/services/insurers";
import { createAppointment } from "@/lib/services/appointments";
import { findPossibleDuplicates } from "@/lib/services/patients";
import type { PreRegistrationPayload } from "@/lib/validations/preregistration";
import type { BookFirstTimeInput } from "@/lib/validations/appointment";
import type { Prisma } from "@prisma/client";

const EXPIRY_DAYS = 7;

/**
 * El enlace muere al terminar el día de la consulta.
 *
 * Es lo que hace que un enlace filtrado o reenviado tenga valor por horas y no
 * para siempre: si el paciente no lo llenó, recepción le muestra el QR el mismo
 * día y con eso basta.
 */
function endOfAppointmentDay(startTime: Date): Date {
  const end = new Date(startTime);
  end.setHours(23, 59, 59, 999);
  return end;
}

/** Genera el siguiente número de expediente consecutivo por organización. */
async function nextRecordNumber(organizationId: string): Promise<string> {
  const count = await db.patient.count({ where: { organizationId } });
  const year = new Date().getFullYear();
  return `EXP-${year}-${String(count + 1).padStart(5, "0")}`;
}

/**
 * Marca que manda el formulario cuando el paciente declara NO tener alergias
 * o enfermedades crónicas. No es un valor: es una negación explícita.
 */
export const NEGATED = "__NEGADAS__";

const isNegated = (text?: string) => text?.trim() === NEGATED;

/** Convierte texto de varias líneas en una lista de valores limpios. */
function linesToList(text?: string): string[] {
  if (!text || isNegated(text)) return [];
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** El consultorio genera un enlace de prerregistro para un paciente nuevo. */
export async function createPreRegistrationToken(organizationId: string) {
  const token = generateSecureToken();
  const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  return db.publicFormToken.create({
    data: { organizationId, type: "PRE_REGISTRATION", token, status: "GENERATED", expiresAt },
  });
}

/**
 * Agenda a un paciente de primera vez: crea un expediente mínimo (solo nombre),
 * la cita FIRST_TIME ligada a ese paciente, y un token de prerregistro ligado a
 * ambos. Devuelve la cadena del token para armar el enlace/QR.
 */
/** Error de negocio: el mensaje se le muestra a recepción tal cual. */
export class DuplicatePatientError extends Error {
  constructor(public matches: { id: string; recordNumber: string; fullName: string }[]) {
    super("Ya existe un expediente que coincide con estos datos.");
    this.name = "DuplicatePatientError";
  }
}

export async function bookFirstTimeIntake(
  organizationId: string,
  userId: string,
  input: BookFirstTimeInput
) {
  // Candado: no se crea un expediente sin haber buscado coincidencias. Si las
  // hay, recepción debe elegir el existente o confirmar que es otra persona.
  if (!input.confirmedNotDuplicate) {
    const matches = await findPossibleDuplicates(organizationId, {
      firstName: input.firstName,
      lastName1: input.lastName1,
      phone: input.phone,
      email: input.email,
      birthDate: input.birthDate,
    });
    if (matches.length > 0) {
      throw new DuplicatePatientError(
        matches.map((m) => ({
          id: m.id,
          recordNumber: m.recordNumber,
          fullName: `${m.firstName} ${m.lastLastName}`,
        }))
      );
    }
  }

  const recordNumber = await nextRecordNumber(organizationId);

  const patient = await db.patient.create({
    data: {
      organizationId,
      recordNumber,
      firstName: input.firstName,
      lastLastName: input.lastName1,
      secondLastName: input.lastName2 || null,
      phone: input.phone,
      email: input.email || null,
      birthDate: input.birthDate,
      sex: "UNDETERMINED", // lo define el paciente en su prerregistro
      adminNotes: "Cita de primera vez. Historia clínica por completar por el paciente vía prerregistro.",
      createdBy: userId,
      updatedBy: userId,
      medicalProfile: { create: {} },
      medicalHistory: { create: {} },
    },
  });

  const appointment = await createAppointment(organizationId, userId, {
    patientId: patient.id,
    doctorId: input.doctorId,
    scheduledDate: input.scheduledDate,
    startTime: input.startTime,
    durationMinutes: input.durationMinutes,
    type: "FIRST_TIME",
    reason: input.reason || "",
    channel: "PHONE",
    allowOverbook: input.allowOverbook,
  });

  const token = generateSecureToken();
  await db.publicFormToken.create({
    data: {
      organizationId,
      type: "PRE_REGISTRATION",
      token,
      status: "GENERATED",
      expiresAt: endOfAppointmentDay(appointment.startTime),
      patientId: patient.id,
      appointmentId: appointment.id,
    },
  });

  return { patient, appointment, token };
}

/** Devuelve (o crea) el token de prerregistro de una cita, para enviar el QR. */
export async function getOrCreateAppointmentPreRegToken(organizationId: string, appointmentId: string) {
  const appt = await db.appointment.findFirst({
    where: { id: appointmentId, organizationId },
    include: {
      publicFormTokens: { where: { type: "PRE_REGISTRATION" }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!appt) throw new Error("Cita no encontrada.");

  const existing = appt.publicFormTokens[0];
  if (existing && existing.status !== "REVOKED" && existing.expiresAt > new Date()) {
    return existing.token;
  }

  const token = generateSecureToken();
  await db.publicFormToken.create({
    data: {
      organizationId,
      type: "PRE_REGISTRATION",
      token,
      status: "GENERATED",
      expiresAt: endOfAppointmentDay(appt.startTime),
      patientId: appt.patientId,
      appointmentId: appt.id,
    },
  });
  return token;
}

/** Busca un token por su cadena (para la página pública). */
export async function getPreRegByToken(token: string) {
  return db.publicFormToken.findUnique({ where: { token } });
}

/** Estado utilizable del enlace público. */
export function tokenUsability(t: Awaited<ReturnType<typeof getPreRegByToken>>) {
  if (!t || t.type !== "PRE_REGISTRATION") return "INVALID" as const;
  if (t.status === "CONVERTED" || t.status === "REVOKED") return "CLOSED" as const;
  if (t.expiresAt < new Date()) return "EXPIRED" as const;
  if (t.status === "SUBMITTED") return "SUBMITTED" as const;
  return "OPEN" as const;
}

/** El paciente envía su formulario. Sin sesión (ruta pública). */
export async function submitPreRegistration(token: string, payload: PreRegistrationPayload) {
  const t = await db.publicFormToken.findUnique({ where: { token } });
  const usable = tokenUsability(t);
  if (usable === "INVALID") throw new Error("El enlace no es válido.");
  if (usable === "CLOSED") throw new Error("Este enlace ya no está disponible.");
  if (usable === "EXPIRED") throw new Error("Este enlace expiró. Solicita uno nuevo al consultorio.");
  if (usable === "SUBMITTED") throw new Error("Ya recibimos tus datos con este enlace.");

  // Si el enlace está ligado a un expediente existente (cita de primera vez),
  // se aplican los datos directamente a ese paciente (sin duplicar).
  if (t?.patientId) {
    await applyPayloadToPatient(t.organizationId, t.patientId, payload);
  }

  return db.publicFormToken.update({
    where: { token },
    data: {
      status: "SUBMITTED",
      submittedAt: new Date(),
      payloadJson: payload as unknown as Prisma.InputJsonValue,
    },
  });
}

/** Construye el texto combinado de "otros antecedentes familiares" (+ cáncer). */
function familyOthersFrom(p: PreRegistrationPayload): string | null {
  return (
    [
      p.familyCancerTypes ? `Cáncer en la familia: ${p.familyCancerTypes}` : "",
      p.familyOthers || "",
    ]
      .filter(Boolean)
      .join(" | ") || null
  );
}

/** Aplica el prerregistro a un expediente YA existente (cita de primera vez). */
export async function applyPayloadToPatient(
  organizationId: string,
  patientId: string,
  p: PreRegistrationPayload
) {
  const patient = await db.patient.findFirst({ where: { id: patientId, organizationId } });
  if (!patient) throw new Error("Paciente no encontrado.");

  const birth = new Date(p.birthDate);
  const birthDate = isNaN(birth.getTime()) ? patient.birthDate : birth;

  await db.patient.update({
    where: { id: patientId },
    data: {
      firstName: p.firstName,
      lastLastName: p.lastName1,
      secondLastName: p.lastName2 || null,
      birthDate,
      sex: p.sex,
      phone: p.phone || patient.phone,
      email: p.email || null,
      address: p.address || null,
      city: p.city || null,
      state: p.state || null,
      postalCode: p.postalCode || null,
      country: p.country || "MX",
      occupation: p.occupation || null,
      maritalStatus: p.maritalStatus ? (p.maritalStatus as never) : null,
    },
  });

  await db.medicalHistory.upsert({
    where: { patientId },
    update: {
      familyDiabetes: p.familyDiabetes,
      familyHypertension: p.familyHypertension,
      familyCancer: p.familyCancer,
      familyHeartDisease: p.familyHeartDisease,
      familyHereditaryDisease: p.familyHereditaryDisease,
      familyOthers: familyOthersFrom(p),
      familyNegated: p.noFamily ?? false,
      priorDiseases: p.priorDiseases || null,
      surgeriesNotes: p.surgeriesNotes || null,
      hospitalizationsNotes: p.hospitalizationsNotes || null,
      smoking: p.smoking || null,
      alcohol: p.alcohol || null,
      exercise: p.exercise || null,
      substanceUse: p.substanceUse || null,
    },
    create: {
      patientId,
      familyDiabetes: p.familyDiabetes,
      familyHypertension: p.familyHypertension,
      familyCancer: p.familyCancer,
      familyHeartDisease: p.familyHeartDisease,
      familyHereditaryDisease: p.familyHereditaryDisease,
      familyOthers: familyOthersFrom(p),
      familyNegated: p.noFamily ?? false,
      priorDiseases: p.priorDiseases || null,
      surgeriesNotes: p.surgeriesNotes || null,
      hospitalizationsNotes: p.hospitalizationsNotes || null,
      smoking: p.smoking || null,
      alcohol: p.alcohol || null,
      exercise: p.exercise || null,
      substanceUse: p.substanceUse || null,
    },
  });

  // Se guarda que el paciente NEGÓ tener alergias o crónicas. Sin esto, negar
  // y no contestar se ven idénticos en el expediente.
  await db.medicalProfile.update({
    where: { patientId },
    data: {
      allergiesNegated: p.allergies?.trim() === NEGATED,
      chronicNegated: p.chronicConditions?.trim() === NEGATED,
    },
  });

  // Alergias, crónicas y medicamentos: se reemplazan con lo capturado.
  await db.allergy.deleteMany({ where: { patientId } });
  await db.chronicCondition.deleteMany({ where: { patientId } });
  await db.currentMedication.deleteMany({ where: { patientId } });

  const allergies = linesToList(p.allergies).map((substance) => ({ patientId, substance }));
  const chronic = linesToList(p.chronicConditions).map((name) => ({ patientId, name }));
  const meds = linesToList(p.currentMedications).map((name) => ({ patientId, name }));
  if (allergies.length) await db.allergy.createMany({ data: allergies });
  if (chronic.length) await db.chronicCondition.createMany({ data: chronic });
  if (meds.length) await db.currentMedication.createMany({ data: meds });

  // Contacto de emergencia (si lo indicó).
  if (p.emergencyContactName) {
    await db.patientEmergencyContact.create({
      data: {
        patientId,
        fullName: p.emergencyContactName,
        relationship: p.emergencyContactRelationship || "No especificado",
        phone: p.emergencyContactPhone || "",
      },
    });
  }

  // Aseguradora (si eligió una del catálogo y aún no está ligada).
  if (p.insurerId) {
    const insurer = await getInsurer(organizationId, p.insurerId);
    if (insurer) {
      const already = await db.patientInsurance.findFirst({
        where: { patientId, insurerId: p.insurerId },
      });
      if (!already) {
        await linkPatientInsurance(organizationId, {
          patientId,
          insurerId: p.insurerId,
          policyNumber: p.insurancePolicyNumber,
          affiliateNumber: p.insuranceAffiliateNumber,
        });
      }
    }
  }

  await logAudit({
    organizationId,
    action: "UPDATE",
    entity: "patient",
    entityId: patientId,
    newValues: { source: "preregistration_self_complete" },
  });

  return patient;
}

/** Lista los prerregistros vigentes de la organización (para el consultorio). */
export async function listPreRegistrations(organizationId: string) {
  return db.publicFormToken.findMany({
    where: {
      organizationId,
      type: "PRE_REGISTRATION",
      status: { in: ["GENERATED", "OPENED", "STARTED", "SUBMITTED"] },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function getPreRegistrationById(organizationId: string, id: string) {
  return db.publicFormToken.findFirst({
    where: { id, organizationId, type: "PRE_REGISTRATION" },
  });
}

/** El consultorio revisa y convierte el prerregistro en un expediente real. */
export async function convertPreRegistrationToPatient(
  organizationId: string,
  userId: string,
  id: string
) {
  const t = await getPreRegistrationById(organizationId, id);
  if (!t) throw new Error("Prerregistro no encontrado.");
  if (t.status === "CONVERTED") throw new Error("Este prerregistro ya fue convertido.");
  if (!t.payloadJson) throw new Error("El prerregistro no tiene datos capturados.");

  const p = t.payloadJson as unknown as PreRegistrationPayload;
  const recordNumber = await nextRecordNumber(organizationId);

  const birth = new Date(p.birthDate);
  const birthDate = isNaN(birth.getTime()) ? new Date() : birth;

  const allergies = linesToList(p.allergies).map((substance) => ({ substance }));
  const chronic = linesToList(p.chronicConditions).map((name) => ({ name }));
  const meds = linesToList(p.currentMedications).map((name) => ({ name }));

  // Los tipos de cáncer familiar se agregan al texto de "otros antecedentes".
  const familyOthersCombined = [
    p.familyCancerTypes ? `Cáncer en la familia: ${p.familyCancerTypes}` : "",
    p.familyOthers || "",
  ]
    .filter(Boolean)
    .join(" | ") || null;

  const patient = await db.patient.create({
    data: {
      organizationId,
      recordNumber,
      firstName: p.firstName,
      lastLastName: p.lastName1,
      secondLastName: p.lastName2 || null,
      birthDate,
      sex: p.sex,
      curp: p.curp || null,
      phone: p.phone || null,
      email: p.email || null,
      address: p.address || null,
      city: p.city || null,
      state: p.state || null,
      postalCode: p.postalCode || null,
      country: p.country || "MX",
      occupation: p.occupation || null,
      maritalStatus: p.maritalStatus ? (p.maritalStatus as never) : null,
      adminNotes: "Creado desde prerregistro del paciente.",
      createdBy: userId,
      updatedBy: userId,
      medicalProfile: {
        create: {
          allergiesNegated: p.allergies?.trim() === NEGATED,
          chronicNegated: p.chronicConditions?.trim() === NEGATED,
        },
      },
      medicalHistory: {
        create: {
          familyDiabetes: p.familyDiabetes,
          familyHypertension: p.familyHypertension,
          familyCancer: p.familyCancer,
          familyHeartDisease: p.familyHeartDisease,
          familyHereditaryDisease: p.familyHereditaryDisease,
          familyOthers: familyOthersCombined,
          familyNegated: p.noFamily ?? false,
          priorDiseases: p.priorDiseases || null,
          surgeriesNotes: p.surgeriesNotes || null,
          hospitalizationsNotes: p.hospitalizationsNotes || null,
          smoking: p.smoking || null,
          alcohol: p.alcohol || null,
          exercise: p.exercise || null,
          diet: p.diet || null,
          substanceUse: p.substanceUse || null,
        },
      },
      allergies: allergies.length ? { create: allergies } : undefined,
      chronicConditions: chronic.length ? { create: chronic } : undefined,
      currentMedications: meds.length ? { create: meds } : undefined,
      emergencyContacts: p.emergencyContactName
        ? {
            create: [
              {
                fullName: p.emergencyContactName,
                relationship: p.emergencyContactRelationship || "No especificado",
                phone: p.emergencyContactPhone || "",
              },
            ],
          }
        : undefined,
    },
  });

  // Si el paciente indicó una aseguradora del catálogo, se liga con su protocolo.
  if (p.insurerId) {
    const insurer = await getInsurer(organizationId, p.insurerId);
    if (insurer) {
      await linkPatientInsurance(organizationId, {
        patientId: patient.id,
        insurerId: p.insurerId,
        policyNumber: p.insurancePolicyNumber,
        affiliateNumber: p.insuranceAffiliateNumber,
      });
    }
  }

  await db.publicFormToken.update({
    where: { id: t.id },
    data: { status: "CONVERTED", patientId: patient.id },
  });

  await logAudit({
    organizationId,
    userId,
    action: "CREATE",
    entity: "patient",
    entityId: patient.id,
    newValues: { recordNumber, source: "preregistration", tokenId: t.id },
  });

  return patient;
}
