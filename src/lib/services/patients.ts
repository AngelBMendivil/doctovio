import { db } from "@/lib/db";
import type { CreatePatientInput, QuickAdmitPatientInput } from "@/lib/validations/patient";
import { logAudit } from "@/lib/services/audit";

/** Genera el siguiente número de expediente consecutivo por organización. */
async function nextRecordNumber(organizationId: string): Promise<string> {
  const count = await db.patient.count({ where: { organizationId } });
  const year = new Date().getFullYear();
  return `EXP-${year}-${String(count + 1).padStart(5, "0")}`;
}

/**
 * Busca posibles duplicados por nombre+apellido, fecha de nacimiento,
 * teléfono, correo o CURP. Se usa ANTES de crear un paciente nuevo.
 */
export async function findPossibleDuplicates(
  organizationId: string,
  criteria: { firstName?: string; lastName1?: string; birthDate?: Date; phone?: string; email?: string; curp?: string }
) {
  const or: Record<string, unknown>[] = [];

  if (criteria.firstName && criteria.lastName1) {
    or.push({
      firstName: { equals: criteria.firstName, mode: "insensitive" },
      lastLastName: { equals: criteria.lastName1, mode: "insensitive" },
    });
  }
  // Se compara por los últimos 10 dígitos: los teléfonos se capturan con
  // espacios, guiones o lada, y una comparación exacta no encontraría nada.
  if (criteria.phone) {
    const digits = criteria.phone.replace(/\D/g, "").slice(-10);
    if (digits.length >= 7) or.push({ phone: { contains: digits } });
  }
  if (criteria.email) or.push({ email: { equals: criteria.email, mode: "insensitive" } });
  if (criteria.curp) or.push({ curp: { equals: criteria.curp, mode: "insensitive" } });
  if (criteria.birthDate) or.push({ birthDate: criteria.birthDate });

  if (or.length === 0) return [];

  return db.patient.findMany({
    where: { organizationId, status: { not: "ARCHIVED" }, OR: or },
    take: 10,
    orderBy: { createdAt: "desc" },
  });
}

export async function createPatient(organizationId: string, userId: string, input: CreatePatientInput) {
  const recordNumber = await nextRecordNumber(organizationId);

  const patient = await db.patient.create({
    data: {
      organizationId,
      recordNumber,
      firstName: input.firstName,
      lastLastName: input.lastName1,
      secondLastName: input.lastName2 || null,
      birthDate: input.birthDate,
      sex: input.sex,
      gender: input.gender || null,
      curp: input.curp || null,
      phone: input.phone || null,
      email: input.email || null,
      address: input.address || null,
      city: input.city || null,
      state: input.state || null,
      postalCode: input.postalCode || null,
      country: input.country,
      occupation: input.occupation || null,
      maritalStatus: input.maritalStatus,
      adminNotes: input.adminNotes || null,
      createdBy: userId,
      updatedBy: userId,
      medicalProfile: { create: {} },
      medicalHistory: { create: {} },
    },
  });

  await logAudit({
    organizationId,
    userId,
    action: "CREATE",
    entity: "patient",
    entityId: patient.id,
    newValues: patient,
  });

  return patient;
}

/** Alta rápida usada en "Agregar paciente sin cita". El expediente se completa después. */
export async function quickAdmitPatient(organizationId: string, userId: string, input: QuickAdmitPatientInput) {
  const recordNumber = await nextRecordNumber(organizationId);
  const parts = input.fullName.trim().split(/\s+/);
  const firstName = parts[0] || input.fullName;
  const lastLastName = parts.slice(1).join(" ") || "Sin apellido";

  // Intenta interpretar como fecha; si no, usa hoy como placeholder y lo marca en notas.
  const parsedDate = new Date(input.birthDateOrAge);
  const birthDate = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

  const patient = await db.patient.create({
    data: {
      organizationId,
      recordNumber,
      firstName,
      lastLastName,
      birthDate,
      sex: "UNDETERMINED",
      phone: input.phone || null,
      adminNotes: `Alta rápida sin cita. Edad/fecha capturada: "${input.birthDateOrAge}". Motivo: ${input.reason}. Tipo de atención: ${input.careType}. Pendiente completar expediente.`,
      createdBy: userId,
      updatedBy: userId,
      medicalProfile: { create: {} },
      medicalHistory: { create: {} },
    },
  });

  await logAudit({ organizationId, userId, action: "CREATE", entity: "patient", entityId: patient.id, newValues: patient });

  return patient;
}

/** Actualiza los datos generales de un paciente (sin borrar su historial). */
export async function updatePatientGeneral(
  organizationId: string,
  userId: string,
  patientId: string,
  data: {
    firstName: string;
    lastName1: string;
    lastName2?: string;
    birthDate: Date;
    sex: string;
    phone?: string;
    email?: string;
    occupation?: string;
    maritalStatus?: string;
    address?: string;
    city?: string;
    state?: string;
    curp?: string;
    bloodType?: string;
  }
) {
  const patient = await db.patient.findFirst({ where: { id: patientId, organizationId } });
  if (!patient) throw new Error("Paciente no encontrado.");

  await db.patient.update({
    where: { id: patientId },
    data: {
      firstName: data.firstName,
      lastLastName: data.lastName1,
      secondLastName: data.lastName2 || null,
      birthDate: data.birthDate,
      sex: data.sex as never,
      phone: data.phone || null,
      email: data.email || null,
      occupation: data.occupation || null,
      maritalStatus: (data.maritalStatus || null) as never,
      address: data.address || null,
      city: data.city || null,
      state: data.state || null,
      curp: data.curp || null,
      updatedBy: userId,
    },
  });

  await db.medicalProfile.upsert({
    where: { patientId },
    update: { bloodType: data.bloodType || null },
    create: { patientId, bloodType: data.bloodType || null },
  });

  await logAudit({ organizationId, userId, action: "UPDATE", entity: "patient", entityId: patientId });
}

/** Da de baja (archiva) un paciente: sale de la lista pero conserva su historial. */
export async function archivePatient(organizationId: string, userId: string, patientId: string) {
  const patient = await db.patient.findFirst({ where: { id: patientId, organizationId } });
  if (!patient) throw new Error("Paciente no encontrado.");

  const updated = await db.patient.update({
    where: { id: patientId },
    data: { status: "ARCHIVED", updatedBy: userId, dischargedAt: new Date() },
  });

  await logAudit({ organizationId, userId, action: "SOFT_DELETE", entity: "patient", entityId: patientId });
  return updated;
}

export async function getPatientById(organizationId: string, patientId: string) {
  return db.patient.findFirst({
    where: { id: patientId, organizationId },
    include: {
      medicalProfile: true,
      medicalHistory: true,
      alerts: { where: { isActive: true } },
      allergies: { where: { isActive: true } },
      chronicConditions: { where: { isActive: true } },
      currentMedications: { where: { isActive: true } },
      responsibleContacts: { where: { isActive: true } },
      emergencyContacts: { where: { isActive: true } },
      source: true,
      insurances: { where: { isActive: true }, include: { insurer: true } },
    },
  });
}

export async function listPatients(
  organizationId: string,
  params: { search?: string; status?: string; page?: number; pageSize?: number }
) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;

  const where = {
    organizationId,
    // Por defecto se ocultan los pacientes dados de baja (ARCHIVED).
    ...(params.status ? { status: params.status as never } : { status: { not: "ARCHIVED" as never } }),
    ...(params.search
      ? {
          OR: [
            { firstName: { contains: params.search, mode: "insensitive" as const } },
            { lastLastName: { contains: params.search, mode: "insensitive" as const } },
            { recordNumber: { contains: params.search, mode: "insensitive" as const } },
            { phone: { contains: params.search } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    db.patient.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.patient.count({ where }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

/** Construye la línea de tiempo del expediente combinando varias entidades. */
export async function getPatientTimeline(organizationId: string, patientId: string) {
  const [appointments, visits, consultations, prescriptions, orders, documents, referrals] = await Promise.all([
    db.appointment.findMany({ where: { organizationId, patientId }, orderBy: { scheduledDate: "desc" } }),
    db.visit.findMany({ where: { organizationId, patientId }, orderBy: { arrivalTime: "desc" } }),
    db.consultation.findMany({ where: { organizationId, patientId }, orderBy: { date: "desc" } }),
    db.prescription.findMany({ where: { organizationId, patientId }, orderBy: { date: "desc" } }),
    db.medicalOrder.findMany({ where: { organizationId, patientId }, orderBy: { date: "desc" } }),
    db.patientDocument.findMany({ where: { organizationId, patientId }, orderBy: { uploadedAt: "desc" } }),
    db.medicalReferral.findMany({ where: { patientId }, orderBy: { createdAt: "desc" } }),
  ]);

  type TimelineEvent = { date: Date; type: string; label: string; refId: string };
  const events: TimelineEvent[] = [
    ...appointments.map((a) => ({ date: a.scheduledDate, type: "appointment", label: `Cita (${a.status})`, refId: a.id })),
    ...visits.map((v) => ({ date: v.arrivalTime, type: "visit", label: `Llegada (${v.arrivalType})`, refId: v.id })),
    ...consultations.map((c) => ({ date: c.date, type: "consultation", label: `Consulta (${c.status})`, refId: c.id })),
    ...prescriptions.map((p) => ({ date: p.date, type: "prescription", label: `Receta ${p.folio}`, refId: p.id })),
    ...orders.map((o) => ({ date: o.date, type: "medical_order", label: `Orden ${o.folio}`, refId: o.id })),
    ...documents.map((d) => ({ date: d.uploadedAt, type: "document", label: `Documento: ${d.name}`, refId: d.id })),
    ...referrals.map((r) => ({ date: r.createdAt, type: "referral", label: `Referencia (${r.status})`, refId: r.id })),
  ];

  return events.sort((a, b) => b.date.getTime() - a.date.getTime());
}
