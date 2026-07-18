"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { assertPermission } from "@/lib/auth/rbac";
import {
  receiveMessage,
  replyAsHuman,
  returnToBot,
  resolveConversation,
  resetSimulatorSession,
} from "@/lib/conversation/orchestrator";

export type ActionState = { ok: boolean; message: string } | null;

/**
 * Simula un mensaje entrante del paciente. Es exactamente el mismo camino que
 * seguirá un mensaje de WhatsApp real, solo cambia el canal.
 */
export async function simulateIncomingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    assertPermission(session.role, "MANAGE_APPOINTMENTS");

    const phone = String(formData.get("phone") || "").trim();
    const body = String(formData.get("body") || "").trim();
    if (!phone) return { ok: false, message: "Escribe un teléfono para simular." };
    if (!body) return { ok: false, message: "Escribe un mensaje." };

    await receiveMessage(session.organizationId, phone, "SIMULATOR", body);
    revalidatePath("/whatsapp");
    return { ok: true, message: "Mensaje enviado." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error inesperado." };
  }
}

export async function resetSimulatorAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.role, "MANAGE_APPOINTMENTS");
  const phone = String(formData.get("phone") || "");
  await resetSimulatorSession(session.organizationId, phone);
  revalidatePath("/whatsapp");
}

export async function replyAsHumanAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    assertPermission(session.role, "MANAGE_APPOINTMENTS");
    const sessionId = String(formData.get("sessionId") || "");
    const body = String(formData.get("body") || "").trim();
    if (!body) return { ok: false, message: "Escribe un mensaje." };

    await replyAsHuman(sessionId, body);
    revalidatePath("/whatsapp");
    return { ok: true, message: "Mensaje enviado." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error inesperado." };
  }
}

export async function returnToBotAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    assertPermission(session.role, "MANAGE_APPOINTMENTS");
    await returnToBot(String(formData.get("sessionId") || ""));
    revalidatePath("/whatsapp");
    return { ok: true, message: "Listo: el asistente retomó la conversación y le mandó el menú al paciente." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error inesperado." };
  }
}

export async function resolveConversationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    assertPermission(session.role, "MANAGE_APPOINTMENTS");
    await resolveConversation(String(formData.get("sessionId") || ""));
    revalidatePath("/whatsapp");
    return { ok: true, message: "Conversación marcada como resuelta." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error inesperado." };
  }
}
