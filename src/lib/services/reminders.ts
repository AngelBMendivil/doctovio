import { db } from "@/lib/db";
import { sendTemplate, isWhatsAppConfigured, WhatsAppError } from "@/lib/whatsapp/client";
import { credentialsForOrganization } from "@/lib/whatsapp/routing";
import { INITIAL_STATE } from "@/lib/conversation/state";

/**
 * RECORDATORIOS DE CITA.
 *
 * Fuera de la ventana de 24 horas WhatsApp solo permite plantillas aprobadas,
 * y un recordatorio es justo eso: un mensaje que iniciamos nosotros. Por eso
 * usa la plantilla `recordatorio_cita` y no texto libre.
 *
 * La cola vive en la base (ReminderJob), no en memoria: un reinicio del
 * servidor no debe hacer que un paciente se quede sin su recordatorio.
 */

const TEMPLATE_NAME = "recordatorio_cita";
const TEMPLATE_LANG = "es_MX";

/** Estados en los que la cita ya no amerita recordatorio. */
const DEAD_STATUSES = ["CANCELLED", "RESCHEDULED", "NO_SHOW", "COMPLETED"];

const fullDate = (d: Date) =>
  d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });

const fullTime = (d: Date) =>
  d.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit", hour12: true });

/**
 * Sesión de conversación para dejar constancia del recordatorio.
 *
 * Se hace aquí con db en vez de importar el orquestador: ese import cerraba el
 * ciclo scheduling → reminders → orchestrator → machine → scheduling.
 */
async function sessionFor(organizationId: string, phone: string) {
  const normalized = phone.replace(/\D/g, "");
  const where = { organizationId_phone_channel: { organizationId, phone: normalized, channel: "WHATSAPP" as const } };

  const existing = await db.conversationSession.findUnique({ where });
  if (existing) return existing;

  return db.conversationSession.create({
    data: { organizationId, phone: normalized, channel: "WHATSAPP", stateJson: INITIAL_STATE as object },
  });
}

/**
 * Programa (o reprograma) los recordatorios de una cita.
 *
 * Se llama al crear y al reagendar. Es idempotente: borra los pendientes y
 * vuelve a calcular, así que reagendar no deja recordatorios de la hora vieja
 * — el error más obvio y más vergonzoso de este módulo.
 */
export async function scheduleReminders(appointmentId: string): Promise<void> {
  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    include: { organization: { include: { settings: true } } },
  });
  if (!appt) return;

  // Los ya enviados se conservan: son bitácora, no basura.
  await db.reminderJob.deleteMany({ where: { appointmentId, status: "PENDING" } });

  if (!appt.isActive || DEAD_STATUSES.includes(appt.status)) return;

  const hoursList = appt.organization.settings?.reminderHoursBefore ?? [24];
  const now = Date.now();

  const jobs = hoursList
    .map((hoursBefore) => ({
      hoursBefore,
      sendAt: new Date(appt.startTime.getTime() - hoursBefore * 3600_000),
    }))
    // Si la cita es para dentro de dos horas, el recordatorio de 24 h ya no
    // tiene sentido: mandarlo tarde es peor que no mandarlo.
    .filter((j) => j.sendAt.getTime() > now)
    .map((j) => ({
      organizationId: appt.organizationId,
      appointmentId,
      hoursBefore: j.hoursBefore,
      sendAt: j.sendAt,
    }));

  if (jobs.length > 0) {
    await db.reminderJob.createMany({ data: jobs, skipDuplicates: true });
  }
}

/** Cancela los recordatorios pendientes de una cita. */
export async function cancelReminders(appointmentId: string): Promise<void> {
  await db.reminderJob.updateMany({
    where: { appointmentId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
}

/**
 * Manda un recordatorio.
 *
 * Vuelve a validar la cita ANTES de enviar: entre que se encoló y llegó su
 * hora pudo cancelarse. Mandarle un recordatorio de una cita cancelada a un
 * paciente destruye la confianza en el canal entero.
 */
async function sendOne(jobId: string): Promise<void> {
  const job = await db.reminderJob.findUnique({
    where: { id: jobId },
    include: {
      appointment: {
        include: { patient: true, doctor: true },
      },
    },
  });
  if (!job || job.status !== "PENDING") return;

  const appt = job.appointment;

  if (!appt.isActive || DEAD_STATUSES.includes(appt.status)) {
    await db.reminderJob.update({ where: { id: jobId }, data: { status: "SKIPPED" } });
    return;
  }

  // Ya confirmó: no hay nada que recordarle.
  if (appt.status === "CONFIRMED") {
    await db.reminderJob.update({ where: { id: jobId }, data: { status: "SKIPPED" } });
    return;
  }

  // La cita ya pasó. Mandar "te recordamos tu cita" después del hecho es peor
  // que no mandar nada: confunde al paciente y deja mal al consultorio.
  //
  // Pasa siempre que la cola se atrasa — el cron caído unas horas, o un
  // consultorio suspendido varios días que se reactiva con la cola llena. Se
  // compara contra startTime, nunca contra scheduledDate (que es medianoche
  // UTC y desplaza el día en México).
  if (appt.startTime <= new Date()) {
    await db.reminderJob.update({
      where: { id: jobId },
      data: { status: "SKIPPED", error: "La cita ya había pasado cuando tocó mandarlo." },
    });
    return;
  }

  const phone = appt.whatsappPhone || appt.patient.phone;
  if (!phone) {
    await db.reminderJob.update({
      where: { id: jobId },
      data: { status: "FAILED", error: "El paciente no tiene teléfono registrado." },
    });
    return;
  }

  if (!isWhatsAppConfigured()) {
    await db.reminderJob.update({
      where: { id: jobId },
      data: { status: "FAILED", error: "WhatsApp no está configurado." },
    });
    return;
  }

  try {
    // El recordatorio sale del número del consultorio dueño de la cita.
    const creds = await credentialsForOrganization(job.organizationId);

    const { externalId } = await sendTemplate(
      phone,
      TEMPLATE_NAME,
      TEMPLATE_LANG,
      [
        appt.patient.firstName,
        appt.doctor.fullName,
        fullDate(appt.startTime),
        fullTime(appt.startTime),
        appt.folio ?? "—",
      ],
      creds
    );

    await db.reminderJob.update({
      where: { id: jobId },
      data: { status: "SENT", sentAt: new Date(), externalId, error: null },
    });

    // Queda en el hilo de la conversación para que el consultorio vea que se
    // mandó, y para que la respuesta del paciente tenga contexto.
    const session = await sessionFor(job.organizationId, phone);
    await db.conversationMessage.create({
      data: {
        sessionId: session.id,
        direction: "OUT",
        body:
          `Recordatorio: cita con ${appt.doctor.fullName} el ${fullDate(appt.startTime)} ` +
          `a las ${fullTime(appt.startTime)}. Folio ${appt.folio ?? "—"}.`,
        optionsJson: ["Confirmar asistencia", "Reagendar", "Cancelar"],
        externalId,
        deliveryStatus: "sent",
      },
    });
  } catch (e) {
    const retryable = e instanceof WhatsAppError && e.retryable;
    await db.reminderJob.update({
      where: { id: jobId },
      data: {
        // Solo se reintenta lo temporal. Una plantilla rechazada o un número
        // inválido no mejoran por insistir.
        status: retryable && job.attempts < 3 ? "PENDING" : "FAILED",
        attempts: { increment: 1 },
        error: e instanceof Error ? e.message.slice(0, 500) : "Error desconocido",
      },
    });
  }
}

/**
 * Procesa los recordatorios que ya toca mandar.
 *
 * Lo llama el cron. El lote es limitado a propósito: si algo salió mal y hay
 * mil pendientes, es mejor mandarlos poco a poco que quemar la cuota de Meta
 * y que te bloqueen el número.
 *
 * Dos reglas que se aprendieron a golpes y no hay que quitar:
 *
 *   1. Solo consultorios ACTIVOS. Uno suspendido no puede seguir escribiéndole
 *      a sus pacientes por WhatsApp.
 *   2. El lote se reparte ENTRE consultorios, no se toma de una cola global.
 *      Si no, el que trae más atraso se lleva todos los turnos y los demás se
 *      quedan sin mandar nada, en silencio.
 */
export async function processDueReminders(
  limit = 50
): Promise<{ sent: number; total: number; clinics: number; suspended: number }> {
  const now = new Date();

  // Solo consultorios ACTIVOS. Un consultorio suspendido no puede seguir
  // mandándole WhatsApp a sus pacientes: la suspensión le corta el acceso al
  // sistema, y el cron corriendo por su lado la volvía decorativa.
  //
  // Sus recordatorios quedan PENDING, no se borran: si lo reactivan, los que
  // sigan teniendo sentido salen solos. Los de citas ya pasadas los descarta
  // sendOne().
  const pendingFilter = { status: "PENDING" as const, sendAt: { lte: now } };

  const clinics = await db.organization.findMany({
    where: { isActive: true, reminderJobs: { some: pendingFilter } },
    select: { id: true },
  });

  // Visibilidad: cuántos quedaron detenidos por suspensión. Sin este dato,
  // "0 enviados" se ve igual que "no había nada que mandar".
  const suspended = await db.reminderJob.count({
    where: { ...pendingFilter, organization: { isActive: false } },
  });

  if (clinics.length === 0) {
    return { sent: 0, total: 0, clinics: 0, suspended };
  }

  // Reparto parejo entre consultorios.
  //
  // Antes se tomaban los 50 más viejos de la cola global: con 40 consultorios,
  // uno solo con la cola atrasada se llevaba los 50 turnos de cada corrida y
  // los otros 39 no mandaban nada — y como el cron reportaba éxito, nadie se
  // enteraba. Cada consultorio se lleva su parte; lo que no usa uno queda
  // disponible para los siguientes.
  const share = Math.max(1, Math.floor(limit / clinics.length));
  const ids: string[] = [];

  // Primera vuelta: a cada consultorio su parte.
  for (const c of clinics) {
    if (ids.length >= limit) break;
    const jobs = await db.reminderJob.findMany({
      where: { ...pendingFilter, organizationId: c.id },
      select: { id: true },
      orderBy: { sendAt: "asc" },
      take: Math.min(share, limit - ids.length),
    });
    ids.push(...jobs.map((j) => j.id));
  }

  // Segunda vuelta: el cupo que nadie usó se reparte entre los que sí tienen
  // cola. Sin esto, con 40 consultorios la parte de cada uno es 1 y se
  // desperdiciarían 10 turnos por corrida mientras alguien acumula atraso.
  for (const c of clinics) {
    if (ids.length >= limit) break;
    const jobs = await db.reminderJob.findMany({
      where: { ...pendingFilter, organizationId: c.id, id: { notIn: ids } },
      select: { id: true },
      orderBy: { sendAt: "asc" },
      take: limit - ids.length,
    });
    ids.push(...jobs.map((j) => j.id));
  }

  for (const id of ids) await sendOne(id);

  const sent = await db.reminderJob.count({ where: { id: { in: ids }, status: "SENT" } });

  return { sent, total: ids.length, clinics: clinics.length, suspended };
}
