"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { setClinicStatus, updateClinicPlan, registerClinicPayment } from "@/lib/services/clinics";
import { logAudit } from "@/lib/services/audit";
import type { ClinicStatus, ClinicType, PaymentMethod } from "@prisma/client";

/**
 * Acciones del panel de plataforma.
 *
 * TODAS empiezan con `requirePlatformAdmin()`. Es la única puerta: sin esa
 * llamada, cualquier usuario con sesión podría suspender consultorios ajenos
 * mandando el formulario a mano. La interfaz que esconde los botones no es
 * seguridad.
 *
 * Todo queda en la bitácora: se está tocando el acceso y el dinero de terceros.
 */

export type PlatformState = { error?: string; ok?: string };

const VALID_STATUS: ClinicStatus[] = ["TRIAL", "ACTIVE", "SUSPENDED", "CANCELLED"];

/** Suspender/reactivar. Nunca es automático: siempre lo decide una persona. */
export async function setClinicStatusAction(
  _prev: PlatformState,
  formData: FormData
): Promise<PlatformState> {
  try {
    const session = await requirePlatformAdmin();

    const organizationId = String(formData.get("organizationId") || "");
    const status = String(formData.get("status") || "") as ClinicStatus;

    if (!organizationId) return { error: "Falta el consultorio." };
    if (!VALID_STATUS.includes(status)) return { error: "Estado no válido." };

    const r = await setClinicStatus(organizationId, status);

    await logAudit({
      organizationId,
      userId: session.userId,
      action: "UPDATE",
      entity: "organization",
      entityId: organizationId,
      newValues: { status },
    });

    revalidatePath("/admin");
    revalidatePath(`/admin/${organizationId}`);

    return {
      ok:
        r.isActive
          ? `"${r.name}" quedó ${r.status === "TRIAL" ? "en prueba" : "activo"}.`
          : `"${r.name}" quedó ${r.status === "CANCELLED" ? "cancelado" : "suspendido"}. No se borró ninguna información.`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo cambiar el estado." };
  }
}

/** Ajusta giro, tope de usuarios y cuota mensual. */
export async function updateClinicPlanAction(
  _prev: PlatformState,
  formData: FormData
): Promise<PlatformState> {
  try {
    const session = await requirePlatformAdmin();

    const organizationId = String(formData.get("organizationId") || "");
    if (!organizationId) return { error: "Falta el consultorio." };

    const maxUsersRaw = String(formData.get("maxUsers") || "");
    const feeRaw = String(formData.get("monthlyFeeMxn") || "").trim();
    const planName = String(formData.get("planName") || "").trim();

    const data = {
      type: (String(formData.get("type") || "MEDICAL") as ClinicType) ?? undefined,
      maxUsers: maxUsersRaw ? Number(maxUsersRaw) : undefined,
      planName: planName || null,
      // Cadena vacía = "sin cuota definida", que no es lo mismo que cero.
      monthlyFeeMxn: feeRaw === "" ? null : Number(feeRaw),
    };

    if (data.maxUsers !== undefined && Number.isNaN(data.maxUsers)) {
      return { error: "El tope de usuarios debe ser un número." };
    }
    if (data.monthlyFeeMxn !== null && Number.isNaN(data.monthlyFeeMxn)) {
      return { error: "La cuota mensual debe ser un número." };
    }

    await updateClinicPlan(organizationId, data);

    await logAudit({
      organizationId,
      userId: session.userId,
      action: "UPDATE",
      entity: "organization",
      entityId: organizationId,
      newValues: data as Record<string, unknown>,
    });

    revalidatePath(`/admin/${organizationId}`);
    return { ok: "Plan actualizado." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo actualizar el plan." };
  }
}

/** Registra un pago recibido y mueve la fecha de cobertura. */
export async function registerPaymentAction(
  _prev: PlatformState,
  formData: FormData
): Promise<PlatformState> {
  try {
    const session = await requirePlatformAdmin();

    const organizationId = String(formData.get("organizationId") || "");
    const amount = Number(formData.get("amount"));
    const periodStart = String(formData.get("periodStart") || "");
    const periodEnd = String(formData.get("periodEnd") || "");
    const paidAt = String(formData.get("paidAt") || "");

    if (!organizationId) return { error: "Falta el consultorio." };
    if (!amount || Number.isNaN(amount) || amount <= 0) {
      return { error: "Captura un monto mayor que cero." };
    }
    if (!periodStart || !periodEnd || !paidAt) {
      return { error: "Faltan las fechas del periodo o la de pago." };
    }

    // Se fija mediodía para que el desfase de zona horaria no recorra la fecha
    // un día. Es la misma trampa que con scheduledDate.
    const d = (s: string) => new Date(`${s}T12:00:00`);

    await registerClinicPayment({
      organizationId,
      amount,
      periodStart: d(periodStart),
      periodEnd: d(periodEnd),
      paidAt: d(paidAt),
      method: (String(formData.get("method") || "TRANSFER") as PaymentMethod) ?? "TRANSFER",
      reference: String(formData.get("reference") || "").trim() || undefined,
      notes: String(formData.get("notes") || "").trim() || undefined,
      registeredById: session.userId,
    });

    await logAudit({
      organizationId,
      userId: session.userId,
      action: "CREATE",
      entity: "clinic_payment",
      entityId: organizationId,
      newValues: { amount, periodStart, periodEnd },
    });

    revalidatePath("/admin");
    revalidatePath(`/admin/${organizationId}`);
    return { ok: `Pago de $${amount.toLocaleString("es-MX")} registrado.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo registrar el pago." };
  }
}
