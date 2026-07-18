import { db } from "@/lib/db";
import { handleMessage } from "./machine";
import { INITIAL_STATE, type SessionState, type BotReply } from "./state";
import { sendText, sendOptions, isWhatsAppConfigured, WhatsAppError } from "@/lib/whatsapp/client";
import type { MessageChannel } from "@prisma/client";

/**
 * ORQUESTADOR — pega la máquina conversacional con la base de datos.
 *
 * Recibe un mensaje (venga del simulador o de WhatsApp), lo guarda, corre la
 * máquina, guarda las respuestas y las devuelve. El canal es solo un dato:
 * la lógica es idéntica, por eso el simulador prueba de verdad el flujo.
 *
 * El envío real vive detrás de `deliver`: hoy solo escribe en la bitácora;
 * cuando exista el adaptador de WhatsApp, se llama desde ahí sin tocar nada más.
 */

export type Turn = { replies: BotReply[]; escalated: boolean };

/**
 * Deja solo dígitos, CONSERVANDO la lada internacional.
 *
 * Importante: no se recorta a 10 dígitos. WhatsApp entrega el `wa_id` completo
 * (52166..., 1619...) y hay que contestarle a ese mismo identificador. Recortar
 * y volver a pegar una lada por default manda las respuestas a números de otro
 * país. La búsqueda del expediente sí compara por los últimos 10 dígitos.
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export async function getOrCreateSession(organizationId: string, phone: string, channel: MessageChannel) {
  const normalized = normalizePhone(phone);
  const existing = await db.conversationSession.findUnique({
    where: { organizationId_phone_channel: { organizationId, phone: normalized, channel } },
  });
  if (existing) return existing;

  return db.conversationSession.create({
    data: { organizationId, phone: normalized, channel, stateJson: INITIAL_STATE as object },
  });
}

/**
 * Procesa un mensaje entrante del paciente y devuelve las respuestas.
 * Si la conversación está escalada, guarda el mensaje pero el asistente calla:
 * quien contesta es el consultorio.
 */
export async function receiveMessage(
  organizationId: string,
  phone: string,
  channel: MessageChannel,
  body: string,
  externalId?: string
): Promise<Turn> {
  const session = await getOrCreateSession(organizationId, phone, channel);

  // Idempotencia: WhatsApp reenvía el mismo evento si no respondemos a tiempo.
  if (externalId) {
    const dup = await db.conversationMessage.findUnique({ where: { externalId } });
    if (dup) return { replies: [], escalated: false };
  }

  await db.conversationMessage.create({
    data: { sessionId: session.id, direction: "IN", body, externalId },
  });
  await db.conversationSession.update({
    where: { id: session.id },
    data: { lastMessageAt: new Date() },
  });

  // Escalada: el asistente calla, contesta el consultorio.
  if (session.status === "NEEDS_HUMAN") {
    return { replies: [], escalated: true };
  }

  /*
    El ESTADO manda sobre el paso guardado.

    Si la conversación ya no está escalada pero la máquina se quedó en "HUMAN",
    el asistente se quedaría mudo para siempre: pasaba al marcar una
    conversación como resuelta. Y un mensaje nuevo sobre una conversación
    resuelta es, por definición, una conversación nueva: empieza desde el menú.
  */
  const saved = (session.stateJson as SessionState | null) ?? INITIAL_STATE;
  const stale = session.status === "RESOLVED" || saved.step === "HUMAN";
  const state = stale ? INITIAL_STATE : saved;
  const result = await handleMessage(
    organizationId,
    { phone: session.phone, patientId: session.patientId },
    state,
    body
  );

  await db.conversationSession.update({
    where: { id: session.id },
    data: {
      stateJson: result.state as object,
      status: result.escalate ? "NEEDS_HUMAN" : "WAITING_PATIENT",
      escalatedAt: result.escalate ? new Date() : undefined,
      lastIntent: result.state.step,
      patientId: result.state.ctx.patientId ?? session.patientId,
    },
  });

  for (const reply of result.replies) {
    await deliver(session.id, channel, session.phone, reply);
  }

  return { replies: result.replies, escalated: !!result.escalate };
}

/**
 * Entrega un mensaje saliente.
 *
 * Siempre lo registra en la bitácora, mande o no. En el simulador se queda ahí;
 * en WhatsApp se manda a Meta y se guarda el id devuelto, que es con el que
 * después llegan los acuses de entrega.
 *
 * Si el envío falla, el mensaje NO se pierde: queda con estado `failed` y el
 * motivo, visible en la bandeja del consultorio.
 */
export async function deliver(sessionId: string, channel: MessageChannel, phone: string, reply: BotReply) {
  const message = await db.conversationMessage.create({
    data: {
      sessionId,
      direction: "OUT",
      body: reply.text,
      optionsJson: reply.options ?? undefined,
      deliveryStatus: channel === "SIMULATOR" ? "delivered" : "pending",
    },
  });

  if (channel !== "WHATSAPP") return message;

  if (!isWhatsAppConfigured()) {
    await db.conversationMessage.update({
      where: { id: message.id },
      data: { deliveryStatus: "failed", errorText: "WhatsApp no está configurado." },
    });
    return message;
  }

  try {
    const { externalId } = reply.options?.length
      ? await sendOptions(phone, reply.text, reply.options)
      : await sendText(phone, reply.text);

    await db.conversationMessage.update({
      where: { id: message.id },
      data: { externalId: externalId || undefined, deliveryStatus: "sent" },
    });
  } catch (e) {
    const detail = e instanceof WhatsAppError ? e.message : "Error al enviar.";
    await db.conversationMessage.update({
      where: { id: message.id },
      data: { deliveryStatus: "failed", errorText: detail },
    });
    // No se relanza: un fallo de envío no debe tumbar el webhook y hacer que
    // Meta reintente el mensaje entrante.
    console.error("[whatsapp] fallo al enviar:", detail);
  }

  return message;
}

/** Mensaje escrito por una persona del consultorio dentro de la conversación. */
export async function replyAsHuman(sessionId: string, body: string) {
  const session = await db.conversationSession.findUniqueOrThrow({ where: { id: sessionId } });
  await deliver(session.id, session.channel, session.phone, { text: body });
  await db.conversationSession.update({
    where: { id: session.id },
    data: { status: "NEEDS_HUMAN", lastMessageAt: new Date() },
  });
}

/**
 * Devuelve la conversación al asistente y lo hace SALUDAR de inmediato.
 *
 * Sin ese saludo el botón parece muerto: el estado cambia en la base pero el
 * paciente no ve nada y el consultorio tampoco. Además le señala al paciente
 * que ya puede volver a usar el menú.
 */
export async function returnToBot(sessionId: string) {
  const session = await db.conversationSession.update({
    where: { id: sessionId },
    data: { status: "BOT", stateJson: INITIAL_STATE as object, escalatedAt: null },
  });

  // Se corre la máquina desde cero para obtener el menú y se entrega.
  const result = await handleMessage(
    session.organizationId,
    { phone: session.phone, patientId: session.patientId },
    INITIAL_STATE,
    "hola"
  );

  for (const reply of result.replies) {
    await deliver(session.id, session.channel, session.phone, reply);
  }

  await db.conversationSession.update({
    where: { id: session.id },
    data: { stateJson: result.state as object, status: "WAITING_PATIENT", lastMessageAt: new Date() },
  });
}

/**
 * Cierra la conversación. También limpia el estado de la máquina: si se deja
 * el paso viejo (por ejemplo "HUMAN"), el próximo mensaje del paciente no
 * obtendría respuesta.
 */
export async function resolveConversation(sessionId: string) {
  await db.conversationSession.update({
    where: { id: sessionId },
    data: { status: "RESOLVED", stateJson: INITIAL_STATE as object, escalatedAt: null },
  });
}

/**
 * Bandeja del consultorio.
 *
 * Se clasifica por lo que le importa a recepción, no por el estado interno:
 * quién necesita ayuda, quién dejó algo a medias, y quién ya cerró con cita.
 */
export type InboxBucket = "ayuda" | "proceso" | "cita" | "resueltas";

export type InboxRow = {
  id: string;
  phoneMasked: string;
  patientName: string | null;
  recordNumber: string | null;
  status: string;
  /** Qué estaba haciendo el paciente, en palabras. */
  activity: string;
  lastMessage: string;
  lastMessageAt: Date;
  /** Minutos desde el último mensaje: el tiempo de espera. */
  waitingMinutes: number;
  bucket: InboxBucket;
  appointment: { folio: string | null; startTime: Date; status: string } | null;
};

/** Traduce el paso de la máquina a algo que un humano entienda. */
function activityOf(step: string | null): string {
  if (!step) return "Conversación iniciada";
  if (step.startsWith("SCHED")) return "Agendando una cita";
  if (step.startsWith("RESCHED")) return "Reagendando su cita";
  if (step.startsWith("CANCEL")) return "Cancelando su cita";
  if (step === "HUMAN") return "Pidió ayuda del consultorio";
  return "En el menú";
}

export async function listConversations(organizationId: string): Promise<InboxRow[]> {
  const sessions = await db.conversationSession.findMany({
    where: { organizationId },
    include: {
      patient: {
        select: {
          firstName: true,
          lastLastName: true,
          recordNumber: true,
          // Su próxima cita agendada por este canal: es el desenlace que
          // convierte una conversación en resultado.
          appointments: {
            where: {
              isActive: true,
              startTime: { gte: new Date() },
              status: { notIn: ["CANCELLED", "RESCHEDULED", "NO_SHOW"] },
            },
            orderBy: { startTime: "asc" },
            take: 1,
            select: { folio: true, startTime: true, status: true },
          },
        },
      },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
  });

  const now = Date.now();

  return sessions.map((s) => {
    const appt = s.patient?.appointments[0] ?? null;

    // El orden importa: quien necesita ayuda va primero aunque tenga cita.
    let bucket: InboxBucket;
    if (s.status === "NEEDS_HUMAN") bucket = "ayuda";
    else if (s.status === "RESOLVED") bucket = "resueltas";
    else if (appt) bucket = "cita";
    else bucket = "proceso";

    return {
      id: s.id,
      phoneMasked: `•••• ${s.phone.slice(-4)}`,
      patientName: s.patient ? `${s.patient.firstName} ${s.patient.lastLastName}` : null,
      recordNumber: s.patient?.recordNumber ?? null,
      status: s.status,
      activity: activityOf(s.lastIntent),
      lastMessage: s.messages[0]?.body ?? "",
      lastMessageAt: s.lastMessageAt,
      waitingMinutes: Math.floor((now - s.lastMessageAt.getTime()) / 60000),
      bucket,
      appointment: appt,
    };
  });
}

/** Cuántas conversaciones esperan a una persona. Alimenta la campana. */
export async function countNeedsHuman(organizationId: string): Promise<number> {
  return db.conversationSession.count({ where: { organizationId, status: "NEEDS_HUMAN" } });
}

export async function getConversation(organizationId: string, sessionId: string) {
  return db.conversationSession.findFirst({
    where: { id: sessionId, organizationId },
    include: {
      patient: true,
      messages: { orderBy: { createdAt: "asc" }, take: 200 },
    },
  });
}

/** Borra la conversación del simulador para volver a probar desde cero. */
export async function resetSimulatorSession(organizationId: string, phone: string) {
  const normalized = normalizePhone(phone);
  await db.conversationSession.deleteMany({
    where: { organizationId, phone: normalized, channel: "SIMULATOR" },
  });
}
