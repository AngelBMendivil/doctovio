"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { createProduct, updateProduct, subscribeClinic } from "@/lib/services/platform-catalog";
import { generateBillingCycles, registerCyclePayment, waiveCycle } from "@/lib/services/platform-billing";
import { createUserAsMaster, setUserActive, changeUserRole, moveUserToClinic } from "@/lib/services/platform-users";
import { resetUserPasswordGlobal } from "@/lib/services/users";
import { logPlatform } from "@/lib/services/platform-audit";
import type { BillingFrequency, PaymentMethod, UserRoleName } from "@prisma/client";

/**
 * Acciones del panel Master.
 *
 * TODAS empiezan con `requirePlatformAdmin()`. Es la única puerta: sin esa
 * llamada, cualquiera con sesión podría mandar el formulario a mano y tocar
 * consultorios ajenos. Esconder botones en la interfaz no es seguridad.
 *
 * Y todas dejan rastro en la bitácora: aquí se toca el acceso y el dinero de
 * terceros.
 */

export type MasterState = { error?: string; ok?: string };

const num = (v: FormDataEntryValue | null) => Number(String(v ?? "").trim());
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();

/** Envuelve el patrón repetido: autorizar, ejecutar, revalidar, reportar. */
async function run(
  fn: (masterUserId: string) => Promise<string>,
  paths: string[]
): Promise<MasterState> {
  try {
    const session = await requirePlatformAdmin();
    const ok = await fn(session.userId);
    paths.forEach((p) => revalidatePath(p));
    return { ok };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo completar la operación." };
  }
}

// --------------------------------------------------------------- PRODUCTOS

export async function createProductAction(_p: MasterState, f: FormData): Promise<MasterState> {
  return run(async (masterUserId) => {
    const p = await createProduct({
      code: str(f.get("code")),
      name: str(f.get("name")),
      description: str(f.get("description")) || undefined,
      price: num(f.get("price")),
      currency: str(f.get("currency")) || "USD",
      billingFrequency: (str(f.get("billingFrequency")) || "MONTHLY") as BillingFrequency,
    });

    await logPlatform({
      masterUserId,
      action: "CREATE",
      entity: "product",
      entityId: p.id,
      metadata: { code: p.code, price: p.price, currency: p.currency },
    });

    return `Producto ${p.code} creado.`;
  }, ["/master/productos"]);
}

export async function updateProductAction(_p: MasterState, f: FormData): Promise<MasterState> {
  return run(async (masterUserId) => {
    const id = str(f.get("id"));
    const priceRaw = str(f.get("price"));

    const p = await updateProduct(id, {
      name: str(f.get("name")) || undefined,
      description: str(f.get("description")) || null,
      price: priceRaw === "" ? undefined : Number(priceRaw),
      currency: str(f.get("currency")) || undefined,
      billingFrequency: (str(f.get("billingFrequency")) || undefined) as BillingFrequency | undefined,
      isActive: f.get("isActive") === "on",
    });

    await logPlatform({
      masterUserId,
      action: "UPDATE",
      entity: "product",
      entityId: p.id,
      metadata: { code: p.code, price: p.price, isActive: p.isActive },
    });

    // El cambio de precio solo aplica a contrataciones futuras: ni las
    // suscripciones vigentes ni las mensualidades emitidas se tocan.
    return `Producto ${p.code} actualizado. Las suscripciones vigentes conservan su precio.`;
  }, ["/master/productos"]);
}

export async function subscribeClinicAction(_p: MasterState, f: FormData): Promise<MasterState> {
  return run(async (masterUserId) => {
    const organizationId = str(f.get("organizationId"));
    const priceRaw = str(f.get("price"));

    const s = await subscribeClinic({
      organizationId,
      productId: str(f.get("productId")),
      price: priceRaw === "" ? undefined : Number(priceRaw),
    });

    await logPlatform({
      masterUserId,
      action: "CREATE",
      entity: "subscription",
      entityId: s.id,
      organizationId,
      metadata: { product: s.product.code, price: s.price, currency: s.currency },
    });

    return `Suscripción a ${s.product.name} por ${s.price} ${s.currency}.`;
  }, ["/master/consultorios", "/master/cobranza"]);
}

// --------------------------------------------------------------- COBRANZA

/** Genera las mensualidades del periodo. Idempotente. */
export async function generateCyclesAction(_p: MasterState, f: FormData): Promise<MasterState> {
  return run(async (masterUserId) => {
    const period = str(f.get("period")) || undefined;
    const r = await generateBillingCycles(period);

    await logPlatform({
      masterUserId,
      action: "CREATE",
      entity: "billing_cycle",
      metadata: { period: r.period, created: r.created },
    });

    return r.created === 0
      ? `El periodo ${r.period} ya estaba generado. No se duplicó nada.`
      : `${r.created} mensualidad(es) generadas para ${r.period}.`;
  }, ["/master/cobranza", "/master"]);
}

export async function registerCyclePaymentAction(_p: MasterState, f: FormData): Promise<MasterState> {
  return run(async (masterUserId) => {
    const billingCycleId = str(f.get("billingCycleId"));
    const amount = num(f.get("amount"));
    const paidAt = str(f.get("paidAt"));

    if (!(amount > 0)) throw new Error("Captura un monto mayor que cero.");
    if (!paidAt) throw new Error("Falta la fecha de pago.");

    const pago = await registerCyclePayment({
      billingCycleId,
      amount,
      // Mediodía: el desfase de zona horaria no debe recorrer la fecha un día.
      paidAt: new Date(`${paidAt}T12:00:00`),
      method: (str(f.get("method")) || "TRANSFER") as PaymentMethod,
      reference: str(f.get("reference")) || undefined,
      notes: str(f.get("notes")) || undefined,
      registeredById: masterUserId,
    });

    await logPlatform({
      masterUserId,
      action: "CREATE",
      entity: "payment",
      entityId: pago.id,
      organizationId: pago.organizationId,
      metadata: { amount, billingCycleId },
    });

    return `Pago de ${amount} registrado.`;
  }, ["/master/cobranza", "/master"]);
}

export async function waiveCycleAction(_p: MasterState, f: FormData): Promise<MasterState> {
  return run(async (masterUserId) => {
    const id = str(f.get("billingCycleId"));
    const c = await waiveCycle(id, str(f.get("notes")) || undefined);

    await logPlatform({
      masterUserId,
      action: "UPDATE",
      entity: "billing_cycle",
      entityId: id,
      organizationId: c.organizationId,
      metadata: { condonada: true, amount: c.amount },
    });

    return "Mensualidad condonada. Queda registrada, no se borró.";
  }, ["/master/cobranza", "/master"]);
}

// --------------------------------------------------------------- USUARIOS

export async function createUserAction(_p: MasterState, f: FormData): Promise<MasterState> {
  return run(async (masterUserId) => {
    const organizationId = str(f.get("organizationId"));

    const u = await createUserAsMaster({
      organizationId,
      email: str(f.get("email")),
      password: str(f.get("password")),
      fullName: str(f.get("fullName")),
      phone: str(f.get("phone")) || undefined,
      role: str(f.get("role")) as UserRoleName,
    });

    await logPlatform({
      masterUserId,
      action: "CREATE",
      entity: "clinic_user",
      entityId: u.id,
      organizationId,
      metadata: { email: u.email, role: u.primaryRole },
    });

    return `${u.fullName} dado de alta.`;
  }, ["/master/usuarios", "/master/consultorios"]);
}

export async function setUserActiveAction(_p: MasterState, f: FormData): Promise<MasterState> {
  return run(async (masterUserId) => {
    const active = str(f.get("active")) === "true";
    const u = await setUserActive(str(f.get("userId")), active);

    await logPlatform({
      masterUserId,
      action: "UPDATE",
      entity: "clinic_user",
      entityId: u.id,
      organizationId: u.organizationId,
      metadata: { isActive: active },
    });

    return active
      ? `${u.fullName} reactivado.`
      : `${u.fullName} desactivado. No se borró nada: su historial queda intacto.`;
  }, ["/master/usuarios"]);
}

export async function changeUserRoleAction(_p: MasterState, f: FormData): Promise<MasterState> {
  return run(async (masterUserId) => {
    const role = str(f.get("role")) as UserRoleName;
    const u = await changeUserRole(str(f.get("userId")), role);

    await logPlatform({
      masterUserId,
      action: "PERMISSION_CHANGE",
      entity: "clinic_user",
      entityId: u.id,
      organizationId: u.organizationId,
      metadata: { role },
    });

    return `${u.fullName} ahora es ${role}.`;
  }, ["/master/usuarios"]);
}

export async function moveUserAction(_p: MasterState, f: FormData): Promise<MasterState> {
  return run(async (masterUserId) => {
    const organizationId = str(f.get("organizationId"));
    const u = await moveUserToClinic(str(f.get("userId")), organizationId);

    await logPlatform({
      masterUserId,
      action: "UPDATE",
      entity: "clinic_user",
      entityId: u.id,
      organizationId,
      metadata: { movidoA: organizationId },
    });

    return `${u.fullName} cambió de consultorio. Su historial anterior se queda donde estaba.`;
  }, ["/master/usuarios"]);
}

export async function resetPasswordAction(_p: MasterState, f: FormData): Promise<MasterState> {
  return run(async (masterUserId) => {
    const email = str(f.get("email"));
    const password = str(f.get("password"));

    const u = await resetUserPasswordGlobal(email, password);

    // La contraseña NUNCA va a la bitácora, solo el hecho de que se cambió.
    await logPlatform({
      masterUserId,
      action: "PERMISSION_CHANGE",
      entity: "clinic_user",
      metadata: { restablecioAcceso: u.email },
    });

    return `Acceso restablecido para ${u.email}.`;
  }, ["/master/usuarios"]);
}
