import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import type { UserRoleName, ClinicStatus, ClinicType, PaymentMethod } from "@prisma/client";

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
    postalCode?: string;
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
        postalCode: input.branch?.postalCode,
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

// ---------------------------------------------------------------------------
// PLATAFORMA — lo administra el operador (isPlatformAdmin), no los consultorios
// ---------------------------------------------------------------------------

/** Días que quedan (o que ya se pasaron, en negativo) hasta `paidUntil`. */
const DAY_MS = 86_400_000;

export type PaymentState = "SIN_REGISTRO" | "AL_CORRIENTE" | "POR_VENCER" | "VENCIDO";

/**
 * Estado de cobranza de un consultorio.
 *
 * Es SOLO informativo: nada en el sistema suspende por su cuenta a partir de
 * esto. Cortarle a un médico el expediente de su paciente porque una
 * transferencia no se capturó a tiempo no es un daño comercial, así que
 * suspender siempre es una acción deliberada de una persona.
 */
export function paymentState(paidUntil: Date | null, avisoDias = 7): { state: PaymentState; days: number | null } {
  if (!paidUntil) return { state: "SIN_REGISTRO", days: null };

  // Se compara a nivel día: que sean las 11 p.m. no vuelve vencido a nadie.
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const limite = new Date(paidUntil);
  limite.setHours(0, 0, 0, 0);

  const days = Math.round((limite.getTime() - hoy.getTime()) / DAY_MS);

  if (days < 0) return { state: "VENCIDO", days };
  if (days <= avisoDias) return { state: "POR_VENCER", days };
  return { state: "AL_CORRIENTE", days };
}

/** Los estados en los que un consultorio puede operar. */
const OPERABLE: ClinicStatus[] = ["TRIAL", "ACTIVE"];

/**
 * Cambia el estado comercial de un consultorio.
 *
 * ÚNICO lugar donde se escribe `status`. Escribe también `isActive` en la misma
 * operación porque son la misma verdad vista de dos formas: `status` es el
 * estado comercial y `isActive` es la bandera operativa que consultan el
 * middleware, el enrutamiento de WhatsApp y el cron de recordatorios.
 *
 * Actualizar una sin la otra deja al consultorio en un estado imposible —
 * suspendido en el panel pero operando en la práctica, o al revés.
 *
 * Nunca borra nada. Al reactivar, todo vuelve como estaba.
 */
export async function setClinicStatus(organizationId: string, status: ClinicStatus) {
  return db.organization.update({
    where: { id: organizationId },
    data: { status, isActive: OPERABLE.includes(status) },
    select: { id: true, name: true, status: true, isActive: true },
  });
}

/** Ajusta el plan contratado: giro, tope de usuarios y cuota. */
export async function updateClinicPlan(
  organizationId: string,
  data: { type?: ClinicType; maxUsers?: number; planName?: string | null; monthlyFeeMxn?: number | null }
) {
  if (data.maxUsers !== undefined) {
    if (!Number.isInteger(data.maxUsers) || data.maxUsers < 1) {
      throw new Error("El tope de usuarios debe ser un número entero de al menos 1.");
    }
    // Bajar el tope por debajo de los usuarios que ya existen dejaría al
    // consultorio en falta desde el minuto uno. Se avisa en vez de permitirlo
    // en silencio; dar de baja gente es decisión del consultorio, no del plan.
    const actuales = await db.user.count({ where: { organizationId, isActive: true } });
    if (data.maxUsers < actuales) {
      throw new Error(
        `El consultorio ya tiene ${actuales} usuarios activos. ` +
          `Baja primero a los que no ocupe antes de reducir el tope a ${data.maxUsers}.`
      );
    }
  }

  return db.organization.update({
    where: { id: organizationId },
    data: {
      type: data.type,
      maxUsers: data.maxUsers,
      planName: data.planName,
      monthlyFeeMxn: data.monthlyFeeMxn,
    },
    select: { id: true, name: true, type: true, maxUsers: true, planName: true, monthlyFeeMxn: true },
  });
}

/**
 * Registra un pago de suscripción y mueve la fecha de cobertura.
 *
 * `paidUntil` avanza al `periodEnd` del pago, pero SOLO si es posterior a lo
 * que ya había: registrar un pago viejo de un periodo anterior no debe
 * retroceder la cobertura de un consultorio que ya está al corriente.
 *
 * No confundir con `Payment`, que es el cobro del paciente al consultorio.
 */
export async function registerClinicPayment(params: {
  organizationId: string;
  amount: number;
  currency?: string;
  periodStart: Date;
  periodEnd: Date;
  paidAt: Date;
  method?: PaymentMethod;
  reference?: string;
  notes?: string;
  registeredById: string;
}) {
  if (!(params.amount > 0)) throw new Error("El monto debe ser mayor que cero.");
  if (params.periodEnd <= params.periodStart) {
    throw new Error("El fin del periodo debe ser posterior al inicio.");
  }

  return db.$transaction(async (tx) => {
    const payment = await tx.clinicPayment.create({
      data: {
        organizationId: params.organizationId,
        amount: params.amount,
        currency: params.currency ?? "MXN",
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        paidAt: params.paidAt,
        method: params.method ?? "TRANSFER",
        reference: params.reference,
        notes: params.notes,
        registeredById: params.registeredById,
      },
    });

    const org = await tx.organization.findUniqueOrThrow({
      where: { id: params.organizationId },
      select: { paidUntil: true, status: true },
    });

    if (!org.paidUntil || params.periodEnd > org.paidUntil) {
      await tx.organization.update({
        where: { id: params.organizationId },
        data: {
          paidUntil: params.periodEnd,
          // Un consultorio en prueba que paga pasa a cliente. Uno suspendido NO
          // se reactiva solo: reactivar es una decisión aparte, deliberada.
          ...(org.status === "TRIAL" ? { status: "ACTIVE" as ClinicStatus, isActive: true } : {}),
        },
      });
    }

    return payment;
  });
}

/**
 * Panorama de la plataforma para el operador.
 *
 * Devuelve CONTEOS, nunca datos de pacientes. El operador necesita saber que un
 * consultorio tiene 300 pacientes; no tiene por qué saber quiénes son.
 */
export async function listClinicsForPlatform() {
  const orgs = await db.organization.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
      isActive: true,
      maxUsers: true,
      planName: true,
      monthlyFeeMxn: true,
      paidUntil: true,
      createdAt: true,
      _count: { select: { users: true, patients: true, appointments: true } },
      whatsappConnections: { where: { isActive: true }, select: { id: true } },
      doctorSchedules: { select: { id: true }, take: 1 },
    },
  });

  return orgs.map((o) => {
    const pago = paymentState(o.paidUntil);
    return {
      id: o.id,
      name: o.name,
      type: o.type,
      status: o.status,
      isActive: o.isActive,
      users: o._count.users,
      maxUsers: o.maxUsers,
      // El tope se puede exceder si alguien lo bajó con usuarios ya dados de
      // alta: se muestra para que se note, no se corrige solo.
      overUserLimit: o._count.users > o.maxUsers,
      patients: o._count.patients,
      appointments: o._count.appointments,
      planName: o.planName,
      monthlyFeeMxn: o.monthlyFeeMxn,
      paidUntil: o.paidUntil,
      paymentState: pago.state,
      paymentDays: pago.days,
      whatsapp: o.whatsappConnections.length > 0,
      hasSchedule: o.doctorSchedules.length > 0,
      createdAt: o.createdAt,
    };
  });
}

/** Totales de la plataforma para el encabezado del panel. */
export async function platformSummary() {
  const clinics = await listClinicsForPlatform();

  return {
    total: clinics.length,
    operando: clinics.filter((c) => c.isActive).length,
    enPrueba: clinics.filter((c) => c.status === "TRIAL").length,
    suspendidos: clinics.filter((c) => c.status === "SUSPENDED").length,
    vencidos: clinics.filter((c) => c.paymentState === "VENCIDO").length,
    porVencer: clinics.filter((c) => c.paymentState === "POR_VENCER").length,
    usuarios: clinics.reduce((s, c) => s + c.users, 0),
    // Ingreso mensual comprometido por los consultorios que hoy operan.
    ingresoMensual: clinics
      .filter((c) => c.isActive)
      .reduce((s, c) => s + (c.monthlyFeeMxn ?? 0), 0),
  };
}

/**
 * Nombra (o quita) a un operador de plataforma.
 *
 * No hay pantalla para esto a propósito: el primer operador tiene que crearse
 * desde fuera —huevo y gallina— y darse el privilegio a uno mismo desde la
 * interfaz es justo lo que no debe poder hacerse. Se hace desde el script, que
 * exige acceso a la máquina y a la base.
 *
 * Ojo: NO da acceso a datos clínicos de ningún consultorio, solo al panel.
 */
export async function setPlatformAdmin(email: string, value: boolean) {
  const normalized = email.toLowerCase().trim();

  const user = await db.user.findUnique({ where: { email: normalized } });
  if (!user) throw new Error(`No existe ningún usuario con el correo ${normalized}.`);

  return db.user.update({
    where: { email: normalized },
    data: { isPlatformAdmin: value },
    select: { id: true, email: true, fullName: true, isPlatformAdmin: true },
  });
}

/** Quiénes pueden entrar al panel de plataforma. */
export async function listPlatformAdmins() {
  return db.user.findMany({
    where: { isPlatformAdmin: true },
    select: { email: true, fullName: true, isActive: true, organization: { select: { name: true } } },
    orderBy: { email: "asc" },
  });
}

/** Detalle de un consultorio, con su historial de pagos. */
export async function getClinicDetail(organizationId: string) {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      legalName: true,
      type: true,
      status: true,
      isActive: true,
      maxUsers: true,
      planName: true,
      monthlyFeeMxn: true,
      paidUntil: true,
      createdAt: true,
      _count: { select: { patients: true, appointments: true } },
      // Datos de la cuenta, no clínicos.
      users: {
        select: { id: true, fullName: true, email: true, primaryRole: true, isActive: true, lastLoginAt: true },
        orderBy: { createdAt: "asc" },
      },
      clinicPayments: { orderBy: { paidAt: "desc" }, take: 24 },
      whatsappConnections: { select: { instanceId: true, phoneNumber: true, isActive: true } },
    },
  });

  if (!org) return null;

  return { ...org, payment: paymentState(org.paidUntil) };
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
  // Delega en setClinicStatus para que `status` e `isActive` nunca se
  // contradigan. Si esta función escribiera `isActive` por su cuenta, el script
  // y el panel dirían cosas distintas del mismo consultorio.
  //
  // Al reactivar se elige ACTIVE y no TRIAL: quien vuelve de una suspensión es
  // un cliente, no alguien que empieza su prueba.
  return setClinicStatus(organizationId, isActive ? "ACTIVE" : "SUSPENDED");
}
