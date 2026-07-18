import { db } from "@/lib/db";
import { DEFAULT_TEMPLATE, type TemplateConfig } from "@/lib/prescription-template";
import type { Letterhead } from "@/components/documents/letterhead";

/** Normaliza la plantilla guardada en settings, rellenando lo que falte. */
export function resolveTemplate(raw: unknown): TemplateConfig {
  const tmpl = (raw as Record<string, unknown> | null) ?? {};
  return {
    header: { ...DEFAULT_TEMPLATE.header, ...((tmpl.header as object) ?? {}) },
    showDiagnosis: (tmpl.showDiagnosis as boolean) ?? DEFAULT_TEMPLATE.showDiagnosis,
    showAllergies: (tmpl.showAllergies as boolean) ?? DEFAULT_TEMPLATE.showAllergies,
    paperSize: (tmpl.paperSize as "full" | "half") ?? DEFAULT_TEMPLATE.paperSize,
    footer: { ...DEFAULT_TEMPLATE.footer, ...((tmpl.footer as object) ?? {}) },
  };
}

/**
 * Arma el membrete del consultorio para el médico que firma el documento.
 * Lo usan la receta, la orden médica y la referencia: una sola fuente de verdad.
 */
export async function getLetterhead(organizationId: string, doctorId: string): Promise<Letterhead> {
  const [org, doctor] = await Promise.all([
    db.organization.findUnique({
      where: { id: organizationId },
      include: { settings: true, branches: { where: { isActive: true } } },
    }),
    db.user.findUnique({ where: { id: doctorId }, include: { doctorProfile: true } }),
  ]);

  const mainBranch = org?.branches.find((b) => b.isMain) ?? org?.branches[0];
  const cfg = resolveTemplate(org?.settings?.prescriptionTemplate);
  const social =
    (org?.settings?.prescriptionTemplate as { social?: Record<string, string> } | null)?.social ?? {};
  const dp = doctor?.doctorProfile;

  return {
    cfg,
    logoUrl: org?.logoUrl ?? null,
    clinicName: org?.name ?? "Consultorio",
    clinicAddress: [mainBranch?.address, mainBranch?.city, mainBranch?.state].filter(Boolean).join(", "),
    clinicPhone: mainBranch?.phone ?? "",
    email: dp?.professionalEmail ?? "",
    social: {
      website: social.website ?? "",
      facebook: social.facebook ?? "",
      instagram: social.instagram ?? "",
    },
    doctorName: doctor?.fullName ?? "",
    specialty: dp?.specialty ?? "",
    license: dp?.licenseNumber ?? "",
    specialtyLicense: dp?.specialtyLicense ?? "",
    licenseLines: (dp?.licensesText ?? "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean),
    ssaNumber: dp?.ssaNumber ?? "",
    stateRegistration: dp?.stateRegistration ?? "",
  };
}
