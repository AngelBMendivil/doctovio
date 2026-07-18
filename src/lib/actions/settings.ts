"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireSession } from "@/lib/auth/session";
import { assertPermission } from "@/lib/auth/rbac";
import {
  updateOrganizationSettings,
  updateOrganizationProfile,
  updateOrganizationLogo,
  upsertMainBranch,
  updatePrescriptionTemplate,
} from "@/lib/services/organizations";
import { createUser, updateUser, findUserByEmail, upsertDoctorProfile } from "@/lib/services/users";
import {
  organizationProfileSchema,
  branchSchema,
  createUserSchema,
  updateUserSchema,
  doctorProfileSchema,
} from "@/lib/validations/organization";

export type ActionState = { ok: boolean; message: string } | null;

/** Normaliza cualquier error a un mensaje legible para el usuario. */
function toState(error: unknown): ActionState {
  if (error instanceof ZodError) {
    const first = error.issues[0];
    const field = first?.path?.join(".") ?? "";
    return { ok: false, message: field ? `${field}: ${first.message}` : first.message };
  }
  if (error instanceof Error) {
    // Mensajes internos tipo "FORBIDDEN: ..." se muestran más amables.
    if (error.message.startsWith("FORBIDDEN")) {
      return { ok: false, message: "No tienes permiso para realizar esta acción." };
    }
    if (error.message === "UNAUTHENTICATED") {
      return { ok: false, message: "Tu sesión expiró. Vuelve a iniciar sesión." };
    }
    return { ok: false, message: error.message };
  }
  return { ok: false, message: "Ocurrió un error inesperado." };
}

export async function updateSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    assertPermission(session.role, "MANAGE_ORGANIZATION");

    const priceMxn = String(formData.get("basePriceMxn") || "");
    const priceUsd = String(formData.get("basePriceUsd") || "");
    await updateOrganizationSettings(session.organizationId, {
      timezone: String(formData.get("timezone") || "America/Mexico_City"),
      currency: String(formData.get("currency") || "MXN"),
      language: String(formData.get("language") || "es"),
      defaultAppointmentMin: Number(formData.get("defaultAppointmentMin") || 30),
      toleranceMinutes: Number(formData.get("toleranceMinutes") || 10),
      privacyNoticeHtml: String(formData.get("privacyNoticeHtml") || ""),
      whatsappEnabled: formData.get("whatsappEnabled") === "on",
      basePriceMxn: priceMxn ? Number(priceMxn) : null,
      basePriceUsd: priceUsd ? Number(priceUsd) : null,
    });

    revalidatePath("/settings");
    return { ok: true, message: "Configuración general guardada satisfactoriamente." };
  } catch (e) {
    return toState(e);
  }
}

export async function updateOrganizationProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    assertPermission(session.role, "MANAGE_ORGANIZATION");

    const data = organizationProfileSchema.parse(Object.fromEntries(formData.entries()));
    await updateOrganizationProfile(session.organizationId, data);

    revalidatePath("/settings");
    return { ok: true, message: "Datos del consultorio guardados satisfactoriamente." };
  } catch (e) {
    return toState(e);
  }
}

/** Carga / elimina el logotipo del consultorio (se guarda como data URL). */
const LOGO_MAX_CHARS = 700_000; // ~500 KB de imagen en base64
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export async function updateLogoAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    assertPermission(session.role, "MANAGE_ORGANIZATION");

    if (formData.get("remove") === "1") {
      await updateOrganizationLogo(session.organizationId, null);
      revalidatePath("/settings");
      return { ok: true, message: "Logotipo eliminado." };
    }

    const dataUrl = String(formData.get("logo") || "").trim();
    if (!dataUrl) return { ok: false, message: "Selecciona una imagen para el logotipo." };

    const match = /^data:([a-z0-9+/.-]+);base64,/i.exec(dataUrl);
    if (!match || !LOGO_TYPES.includes(match[1].toLowerCase())) {
      return { ok: false, message: "Formato no válido. Usa PNG, JPG, WEBP o SVG." };
    }
    if (dataUrl.length > LOGO_MAX_CHARS) {
      return { ok: false, message: "La imagen es muy grande. Usa uno de máximo 500 KB." };
    }

    await updateOrganizationLogo(session.organizationId, dataUrl);
    revalidatePath("/settings");
    return { ok: true, message: "Logotipo guardado satisfactoriamente." };
  } catch (e) {
    return toState(e);
  }
}

export async function upsertBranchAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    assertPermission(session.role, "MANAGE_ORGANIZATION");

    const data = branchSchema.parse(Object.fromEntries(formData.entries()));
    await upsertMainBranch(session.organizationId, session.userId, data);

    revalidatePath("/settings");
    return { ok: true, message: "Dirección guardada satisfactoriamente." };
  } catch (e) {
    return toState(e);
  }
}

export async function createUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    assertPermission(session.role, "MANAGE_USERS");

    const data = createUserSchema.parse(Object.fromEntries(formData.entries()));

    const existing = await findUserByEmail(session.organizationId, data.email);
    if (existing) {
      return { ok: false, message: "Ya existe un usuario con ese correo en esta organización." };
    }

    await createUser({
      organizationId: session.organizationId,
      email: data.email,
      password: data.password,
      fullName: data.fullName,
      phone: data.phone,
      role: data.role,
      createdBy: session.userId,
    });

    revalidatePath("/settings");
    return { ok: true, message: `Usuario ${data.fullName} creado satisfactoriamente.` };
  } catch (e) {
    return toState(e);
  }
}

export async function updateUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    assertPermission(session.role, "MANAGE_USERS");

    const data = updateUserSchema.parse(Object.fromEntries(formData.entries()));

    // No permitir que el último administrador se quite a sí mismo el rol de admin
    // (evita quedarse sin ningún administrador en la organización).
    if (data.userId === session.userId && data.role !== "ADMIN") {
      return { ok: false, message: "No puedes quitarte a ti mismo el rol de Administrador." };
    }

    await updateUser(session.organizationId, data.userId, {
      fullName: data.fullName,
      phone: data.phone,
      role: data.role,
      password: data.password,
    });

    revalidatePath("/settings");
    return { ok: true, message: `Usuario ${data.fullName} actualizado satisfactoriamente.` };
  } catch (e) {
    return toState(e);
  }
}

/** Plantilla de receta médica (encabezado, contenido, pie). */
export async function updatePrescriptionTemplateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    assertPermission(session.role, "MANAGE_ORGANIZATION");

    let config: Record<string, unknown>;
    try {
      config = JSON.parse(String(formData.get("config") || "{}"));
    } catch {
      return { ok: false, message: "Configuración de plantilla inválida." };
    }
    await updatePrescriptionTemplate(session.organizationId, config);

    revalidatePath("/settings");
    return { ok: true, message: "Plantilla de receta guardada satisfactoriamente." };
  } catch (e) {
    return toState(e);
  }
}

/** Redes sociales del consultorio (para pie de receta y perfil). */
export async function updateSocialMediaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    assertPermission(session.role, "MANAGE_ORGANIZATION");

    const social = {
      website: String(formData.get("website") || "").trim(),
      facebook: String(formData.get("facebook") || "").trim(),
      instagram: String(formData.get("instagram") || "").trim(),
    };
    await updatePrescriptionTemplate(session.organizationId, { social });

    revalidatePath("/settings");
    return { ok: true, message: "Redes sociales guardadas satisfactoriamente." };
  } catch (e) {
    return toState(e);
  }
}

export async function upsertDoctorProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    assertPermission(session.role, "MANAGE_USERS");

    const { userId, ...data } = doctorProfileSchema.parse(Object.fromEntries(formData.entries()));
    await upsertDoctorProfile(session.organizationId, userId, data);

    revalidatePath("/settings");
    return { ok: true, message: "Perfil del médico guardado satisfactoriamente." };
  } catch (e) {
    return toState(e);
  }
}
