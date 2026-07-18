import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/** Actualiza (merge superficial) la plantilla de receta guardada en JSON. */
export async function updatePrescriptionTemplate(organizationId: string, patch: Record<string, unknown>) {
  const existing = await db.organizationSettings.findUnique({ where: { organizationId } });
  const current = (existing?.prescriptionTemplate as Record<string, unknown> | null) ?? {};
  const merged = { ...current, ...patch };
  return db.organizationSettings.upsert({
    where: { organizationId },
    update: { prescriptionTemplate: merged as Prisma.InputJsonValue },
    create: { organizationId, prescriptionTemplate: merged as Prisma.InputJsonValue },
  });
}

export async function getOrganizationSettings(organizationId: string) {
  return db.organizationSettings.findUnique({ where: { organizationId } });
}

/**
 * Configuración general del consultorio.
 *
 * Los campos JSON van tipados como `Prisma.InputJsonValue` y no como `unknown`:
 * con `unknown` no cuadraban con Prisma y se habían tapado con `as never`, lo
 * cual además rompía el build (no se puede esparcir un `never`).
 */
export type OrganizationSettingsInput = Partial<{
  timezone: string;
  currency: string;
  language: string;
  defaultAppointmentMin: number;
  toleranceMinutes: number;
  appointmentTypesJson: Prisma.InputJsonValue;
  consultationTypesJson: Prisma.InputJsonValue;
  specialtiesJson: Prisma.InputJsonValue;
  officeHoursJson: Prisma.InputJsonValue;
  privacyNoticeHtml: string;
  whatsappEnabled: boolean;
  basePriceMxn: number | null;
  basePriceUsd: number | null;
  slotGranularityMin: number;
  bufferMinutes: number;
  minLeadMinutes: number;
  maxAdvanceDays: number;
  cancelMinHours: number;
  holdMinutes: number;
  reminderHoursBefore: number[];
}>;

export async function updateOrganizationSettings(organizationId: string, data: OrganizationSettingsInput) {
  return db.organizationSettings.upsert({
    where: { organizationId },
    update: data,
    create: { organizationId, ...data },
  });
}

export async function getOrganizationWithBranches(organizationId: string) {
  return db.organization.findUnique({
    where: { id: organizationId },
    include: { branches: { where: { isActive: true } }, settings: true },
  });
}

/** Actualiza los datos generales del consultorio (nombre / razón social). */
export async function updateOrganizationProfile(
  organizationId: string,
  data: { name: string; legalName?: string }
) {
  return db.organization.update({
    where: { id: organizationId },
    data: { name: data.name, legalName: data.legalName ?? null },
  });
}

/** Guarda (o borra, con null) el logotipo del consultorio.
 *  Se almacena como data URL en la base para no depender de almacenamiento externo. */
export async function updateOrganizationLogo(organizationId: string, logoUrl: string | null) {
  return db.organization.update({
    where: { id: organizationId },
    data: { logoUrl },
  });
}

/** Devuelve la sucursal principal activa (o la primera activa). */
export async function getMainBranch(organizationId: string) {
  return db.branch.findFirst({
    where: { organizationId, isActive: true },
    orderBy: [{ isMain: "desc" }, { createdAt: "asc" }],
  });
}

/** Crea o actualiza la sucursal principal con su dirección. */
export async function upsertMainBranch(
  organizationId: string,
  userId: string,
  data: {
    name: string;
    address?: string;
    country?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    phone?: string;
  }
) {
  const existing = await getMainBranch(organizationId);
  if (existing) {
    return db.branch.update({
      where: { id: existing.id },
      data: {
        name: data.name,
        address: data.address ?? null,
        country: data.country ?? "MX",
        city: data.city ?? null,
        state: data.state ?? null,
        postalCode: data.postalCode ?? null,
        phone: data.phone ?? null,
        updatedBy: userId,
      },
    });
  }
  return db.branch.create({
    data: {
      organizationId,
      name: data.name,
      address: data.address ?? null,
      country: data.country ?? "MX",
      city: data.city ?? null,
      state: data.state ?? null,
      postalCode: data.postalCode ?? null,
      phone: data.phone ?? null,
      isMain: true,
      createdBy: userId,
    },
  });
}
