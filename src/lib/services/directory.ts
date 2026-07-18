import { db } from "@/lib/db";

/**
 * Directorio médico interno: lista médicos de TODA la plataforma (no solo
 * la organización actual) que hayan optado por aparecer (listedInDirectory).
 * Esto es intencional: es el único lugar donde se cruza información entre
 * organizaciones, y solo expone datos públicos del perfil (no clínicos).
 */
export async function searchDirectory(params: {
  name?: string;
  specialty?: string;
  city?: string;
  state?: string;
  onlyAcceptsReferrals?: boolean;
  excludeOrganizationId?: string;
}) {
  return db.doctorProfile.findMany({
    where: {
      isActive: true,
      listedInDirectory: true,
      acceptsReferrals: params.onlyAcceptsReferrals ? true : undefined,
      specialty: params.specialty ? { contains: params.specialty, mode: "insensitive" } : undefined,
      city: params.city ? { contains: params.city, mode: "insensitive" } : undefined,
      state: params.state ? { contains: params.state, mode: "insensitive" } : undefined,
      organizationId: params.excludeOrganizationId ? { not: params.excludeOrganizationId } : undefined,
      user: params.name
        ? { fullName: { contains: params.name, mode: "insensitive" } }
        : undefined,
    },
    include: { user: true, organization: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}
