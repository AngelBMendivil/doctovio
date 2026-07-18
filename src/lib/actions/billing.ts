"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { assertPermission } from "@/lib/auth/rbac";
import { createPayment } from "@/lib/services/billing";
import { createAppointment } from "@/lib/services/appointments";
import { createAppointmentSchema } from "@/lib/validations/appointment";
import type { PaymentMethod, PaymentOrigin } from "@prisma/client";

export type ActionState = { ok: boolean; message: string } | null;

const METHODS = ["CASH", "TRANSFER", "CARD", "OTHER"] as const;

/** Registra el pago de una consulta. */
export async function createPaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    assertPermission(session.role, "MANAGE_BILLING");

    const consultationId = String(formData.get("consultationId") || "");
    const patientId = String(formData.get("patientId") || "");
    const amount = Number(formData.get("amount") || 0);
    const currency = String(formData.get("currency") || "MXN");
    const method = String(formData.get("method") || "CASH");
    const reference = String(formData.get("reference") || "");
    const notes = String(formData.get("notes") || "");
    const origin: PaymentOrigin = formData.get("origin") === "INSURANCE" ? "INSURANCE" : "PRIVATE";
    const insurerId = String(formData.get("insurerId") || "");

    if (!consultationId || !patientId) return { ok: false, message: "Faltan datos de la consulta." };
    if (!(amount > 0)) return { ok: false, message: "El monto debe ser mayor a 0." };
    if (!(METHODS as readonly string[]).includes(method)) return { ok: false, message: "Método de pago inválido." };
    if (origin === "INSURANCE" && !insurerId) {
      return { ok: false, message: "Selecciona la aseguradora que cubre el cobro." };
    }

    await createPayment(session.organizationId, session.userId, {
      consultationId,
      patientId,
      amount,
      currency: currency === "USD" ? "USD" : "MXN",
      method: method as PaymentMethod,
      origin,
      insurerId: origin === "INSURANCE" ? insurerId : undefined,
      reference,
      notes,
    });

    revalidatePath("/payments");
    revalidatePath(`/payments/${consultationId}`);
    return { ok: true, message: "Pago registrado satisfactoriamente." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error inesperado." };
  }
}

/** Agenda la próxima cita (seguimiento) al cerrar el cobro. */
export async function scheduleFollowUpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    assertPermission(session.role, "MANAGE_APPOINTMENTS");

    const scheduledDate = String(formData.get("scheduledDate") || "");
    const hour = String(formData.get("hour") || "00");
    const minute = String(formData.get("minute") || "00");

    const parsed = createAppointmentSchema.parse({
      patientId: String(formData.get("patientId") || ""),
      doctorId: String(formData.get("doctorId") || ""),
      scheduledDate,
      startTime: `${scheduledDate}T${hour}:${minute}:00`,
      type: "FOLLOW_UP",
      reason: String(formData.get("reason") || ""),
      allowOverbook: true,
    });
    await createAppointment(session.organizationId, session.userId, parsed);

    revalidatePath("/appointments");
    return { ok: true, message: "Próxima cita agendada satisfactoriamente." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error inesperado." };
  }
}
