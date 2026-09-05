"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireSession } from "@/lib/auth/session";
import { assertPermission } from "@/lib/auth/rbac";
import { assertDentalClinic } from "@/lib/services/clinic-features";
import { catalogItemSchema, updateCatalogItemSchema, categorySchema } from "@/lib/validations/dental";
import {
  createCatalogItem,
  updateCatalogItem,
  setCatalogItemActive,
  createCategory,
} from "@/lib/services/catalog";

/**
 * PRODUCTOS Y SERVICIOS DEL CONSULTORIO.
 *
 * Cada acción cierra tres puertas antes de tocar nada: sesión válida, permiso
 * del rol y módulo habilitado para ESTE consultorio. Ocultar el enlace en la
 * barra lateral no protege: la ruta se escribe a mano.
 */

export type ActionState = { ok: boolean; message: string } | null;

function toState(error: unknown): ActionState {
  if (error instanceof ZodError) {
    return { ok: false, message: error.issues[0]?.message ?? "Revisa los campos." };
  }
  if (error instanceof Error) {
    if (error.message.startsWith("FORBIDDEN")) return { ok: false, message: "No tienes permiso para esta acción." };
    return { ok: false, message: error.message };
  }
  return { ok: false, message: "Ocurrió un error inesperado." };
}

export async function createCatalogItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    assertPermission(session.role, "MANAGE_PRODUCTS");
    await assertDentalClinic(session.organizationId);

    const data = catalogItemSchema.parse(Object.fromEntries(formData.entries()));
    await createCatalogItem(session.organizationId, session.userId, {
      name: data.name,
      code: data.code || undefined,
      type: data.type,
      categoryId: data.categoryId || undefined,
      description: data.description || undefined,
      price: data.price,
      currency: data.currency,
      taxRate: data.taxRate,
    });

    revalidatePath("/products");
    return { ok: true, message: `"${data.name}" quedó guardado en el catálogo.` };
  } catch (e) {
    return toState(e);
  }
}

export async function updateCatalogItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    assertPermission(session.role, "MANAGE_PRODUCTS");
    await assertDentalClinic(session.organizationId);

    const { id, isActive, ...data } = updateCatalogItemSchema.parse(Object.fromEntries(formData.entries()));
    await updateCatalogItem(session.organizationId, session.userId, id, {
      name: data.name,
      code: data.code || undefined,
      type: data.type,
      categoryId: data.categoryId || undefined,
      description: data.description || undefined,
      price: data.price,
      currency: data.currency,
      taxRate: data.taxRate,
      isActive,
    });

    revalidatePath("/products");
    revalidatePath(`/products/${id}`);
  } catch (e) {
    return toState(e);
  }
  // Fuera del try: redirect() lanza NEXT_REDIRECT y no debe capturarse.
  redirect("/products");
}

/**
 * Activa o desactiva. NO hay borrar, ni siquiera para los que nadie ha usado:
 * un producto que estuvo en una cotización no se puede quitar sin dejar hueca
 * una hoja que ya se le entregó al paciente.
 */
export async function toggleCatalogItemAction(id: string, isActive: boolean): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, "MANAGE_PRODUCTS");
  await assertDentalClinic(session.organizationId);

  await setCatalogItemActive(session.organizationId, session.userId, id, isActive);
  revalidatePath("/products");
  revalidatePath(`/products/${id}`);
}

export async function createCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    assertPermission(session.role, "MANAGE_PRODUCTS");
    await assertDentalClinic(session.organizationId);

    const { name } = categorySchema.parse(Object.fromEntries(formData.entries()));
    await createCategory(session.organizationId, name);

    revalidatePath("/products");
    return { ok: true, message: `Categoría "${name}" agregada.` };
  } catch (e) {
    return toState(e);
  }
}
