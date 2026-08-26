import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import type { UserRoleName } from "@prisma/client";

/**
 * ALTA DE CONSULTORIOS.
 *
 * Un consultorio no es una fila: es un conjunto de piezas que tienen que
 * existir todas o el consultorio "existe" pero no sirve. Por eso todo pasa en
 * una sola transacción — a medias es peor que nada.
 *
 * Lo que se crea:
 *   Organization           el tenant
 *   OrganizationSettings   zona horaria, reglas de agenda, aviso de privacidad
 *   Branch principal       las citas y visitas cuelgan de una sucursal
 *   User ADMIN             si no, nadie puede entrar
 *   User DOCTOR + perfil   opcional, para recetar y aparecer en el directorio
 *   DoctorSchedule         EL QUE SE OLVIDA (ver abajo)
 *
 * Sobre el horario: sin filas en DoctorSchedule el motor de agenda no ofrece
 * NI UN SOLO espacio. El consultorio se ve bien, entra el usuario, y al querer
 * agendar no hay horarios disponibles: parece que el sistema está roto cuando
 * en realidad nunca se le dijo cuándo trabaja el médico. El seed de ejemplo no
 * los crea y por eso se cae en esta trampa.
 */

export type CreateClinicInput = {
  /** Nombre comercial del consultorio. */
  name: string;
  legalName?: string;
  /** Datos de la sucursal principal. */
  branch?: {
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    phone?: string;
  };
  /** Usuario administrador. Obligatorio: sin él nadie puede entrar. */
  admin: {
    email: string;
    password: string;
    fullName: string;
    phone?: string;
  };
  /**
   * Médico. Si se omite, el administrador queda también como médico: alguien
   * tiene que poder tener agenda, o el consultorio no puede operar.
   */
  doctor?: {
    email: string;
    password: string;
    fullName: string;
    phone?: string;
    specialty?: string;
    licenseNumber?: string;
  };
  /**
   * Horario laboral del médico. Minutos desde medianoche en la zona horaria
   * del consultorio (540 = 9:00, 1080 = 18:00).
   * Por defecto: lunes a viernes de 9:00 a 14:00 y de 16:00 a 19:00.
   */
  schedule?: { weekday: number; startMinute: number; endMinute: number }[];
  settings?: {
    timezone?: string;
    defaultAppointmentMin?: number;
    privacyNoticeHtml?: string;
  };
  /** Número de WhatsApp. Sin esta fila, el bot de este consultorio no contesta. */
  whatsapp?: {
    /** phone_number_id de Meta (o instance id del proveedor). */
    instanceId: string;
    phoneNumber?: string;
    /** Si se omite, usa el token del entorno. */
    accessToken?: string;
    provider?: string;
  };
};

/** Lunes a viernes, 9:00–14:00 y 16:00–19:00. */
const DEFAULT_SCHEDULE = [1, 2, 3, 4, 5].flatMap((weekday) => [
  { weekday, startMinute: 9 * 60, endMinute: 14 * 60 },
  { weekday, startMinute: 16 * 60, endMinute: 19 * 60 },
]);

const normalizeEmail = (email: string) => email.toLowerCase().trim();

/**
 * Revisa los choques ANTES de abrir la transacción, para poder devolver un
 * mensaje entendible en vez de un error de llave duplicada de Postgres.
 *
 * El correo es único en toda la plataforma, no por consultorio: si ya existe,
 * no se puede reusar aunque sea para otro consultorio.
 */
async function assertEmailsAvailable(emails: string[]) {
  const unique = Array.from(new Set(emails.map(normalizeEmail)));

  if (unique.length !== emails.length) {
    throw new Error("El administrador y el médico no pueden usar el mismo correo.");
  }

  const taken = await db.user.findMany({
    where: { email: { in: unique } },
    select: { email: true },
  });

  if (taken.length > 0) {
    const lista = taken.map((u) => u.email).join(", ");
    throw new Error(
      `Estos correos ya están en uso en la plataforma: ${lista}. ` +
        `Cada persona necesita un correo propio, aunque sea de otro consultorio.`
    );
  }
}

async function assertWhatsappAvailable(provider: string, instanceId: string) {
  const taken = await db.whatsappConnection.findUnique({
    where: { provider_instanceId: { provider, instanceId } },
    include: { organization: { select: { name: true } } },
  });

  if (taken) {
    throw new Error(
      `Ese número de WhatsApp ya está asignado al consultorio "${taken.organization.name}". ` +
        `Un número no puede atender a dos consultorios.`
    );
  }
}

export async function createClinic(input: CreateClinicInput) {
  const adminEmail = normalizeEmail(input.admin.email);
  const doctorEmail = input.doctor ? normalizeEmail(input.doctor.email) : null;

  await assertEmailsAvailable(doctorEmail ? [adminEmail, doctorEmail] : [adminEmail]);

  const waProvider = input.whatsapp?.provider ?? "META";
  if (input.whatsapp) {
    await assertWhatsappAvailable(waProvider, input.whatsapp.instanceId);
  }

  // Los hashes se calculan FUERA de la transacción: bcrypt tarda ~100 ms y
  // mantener una transacción abierta ese tiempo sin necesidad es desperdicio.
  const adminHash = await hashPassword(input.admin.password);
  const doctorHash = input.doctor ? await hashPassword(input.doctor.password) : null;

  return db.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        name: input.name,
        legalName: input.legalName,
        isActive: true,
        settings: {
          create: {
            timezone: input.settings?.timezone ?? "America/Mexico_City",
            currency: "MXN",
            language: "es",
            defaultAppointmentMin: input.settings?.defaultAppointmentMin ?? 30,
            toleranceMinutes: 10,
            whatsappEnabled: Boolean(input.whatsapp),
            privacyNoticeHtml: input.settings?.privacyNoticeHtml ?? null,
          },
        },
      },
    });

    const branch = await tx.branch.create({
      data: {
        organizationId: organization.id,
        name: input.branch?.name ?? "Consultorio principal",
        address: input.branch?.address,
        city: input.branch?.city,
        state: input.branch?.state,
        phone: input.branch?.phone,
        country: "MX",
        isMain: true,
      },
    });

    const admin = await tx.user.create({
      data: {
        organizationId: organization.id,
        email: adminEmail,
        passwordHash: adminHash,
        fullName: input.admin.fullName,
        phone: input.admin.phone,
        primaryRole: "ADMIN" as UserRoleName,
      },
    });

    // Sin médico explícito, el administrador lo es también: alguien tiene que
    // poder tener agenda o el consultorio no puede operar.
    let doctor = admin;
    if (input.doctor && doctorEmail && doctorHash) {
      doctor = await tx.user.create({
        data: {
          organizationId: organization.id,
          email: doctorEmail,
          passwordHash: doctorHash,
          fullName: input.doctor.fullName,
          phone: input.doctor.phone,
          primaryRole: "DOCTOR" as UserRoleName,
        },
      });
    }

    await tx.doctorProfile.create({
      data: {
        organizationId: organization.id,
        userId: doctor.id,
        specialty: input.doctor?.specialty,
        licenseNumber: input.doctor?.licenseNumber,
        city: input.branch?.city,
        state: input.branch?.state,
        acceptsReferrals: true,
        // Aparecer en el directorio es una decisión del médico, no un default
        // que se le impone al darlo de alta.
        listedInDirectory: false,
      },
    });

    const schedule = input.schedule ?? DEFAULT_SCHEDULE;
    await tx.doctorSchedule.createMany({
      data: schedule.map((s) => ({
        organizationId: organization.id,
        doctorId: doctor.id,
        branchId: branch.id,
        weekday: s.weekday,
        startMinute: s.startMinute,
        endMinute: s.endMinute,
      })),
    });

    if (input.whatsapp) {
      await tx.whatsappConnection.create({
        data: {
          organizationId: organization.id,
          provider: waProvider,
          instanceId: input.whatsapp.instanceId,
          phoneNumber: input.whatsapp.phoneNumber,
          accessToken: input.whatsapp.accessToken ?? null,
          isActive: true,
        },
      });
    }

    return {
      organizationId: organization.id,
      name: organization.name,
      branchId: branch.id,
      adminId: admin.id,
      adminEmail: admin.email,
      doctorId: doctor.id,
      doctorEmail: doctor.email,
      scheduleRows: schedule.length,
      whatsapp: Boolean(input.whatsapp),
    };
  });
}

/** Consultorios de la plataforma, con lo mínimo para saber si están sanos. */
export async function listClinics() {
  const orgs = await db.organization.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      isActive: true,
      createdAt: true,
      _count: { select: { users: true, patients: true, appointments: true } },
      whatsappConnections: { select: { instanceId: true, isActive: true } },
      doctorSchedules: { select: { id: true }, take: 1 },
    },
  });

  return orgs.map((o) => ({
    id: o.id,
    name: o.name,
    isActive: o.isActive,
    createdAt: o.createdAt,
    users: o._count.users,
    patients: o._count.patients,
    appointments: o._count.appointments,
    whatsapp: o.whatsappConnections.some((c) => c.isActive),
    // Sin horario no hay disponibilidad: el consultorio no puede agendar.
    hasSchedule: o.doctorSchedules.length > 0,
  }));
}

/**
 * Suspende o reactiva un consultorio.
 *
 * NUNCA borra nada: pacientes, expedientes, citas, recetas e historial quedan
 * intactos. Lo único que se corta es el acceso, y al reactivar todo vuelve a
 * funcionar sin ningún paso extra.
 */
export async function setClinicActive(organizationId: string, isActive: boolean) {
  return db.organization.update({
    where: { id: organizationId },
    data: { isActive },
    select: { id: true, name: true, isActive: true },
  });
}
