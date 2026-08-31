import { db } from "@/lib/db";
import { logAudit } from "@/lib/services/audit";
import type { AuditAction, Prisma } from "@prisma/client";

/**
 * BITÁCORA DE ACCIONES DEL MASTER.
 *
 * Se apoya en la tabla `audit_logs` que ya existía en vez de crear una nueva:
 * una sola bitácora es más fácil de auditar que dos, y ya tenía índices,
 * usuario, valores anteriores y posteriores.
 *
 * La diferencia es que aquí `organizationId` puede ir nulo — crear un
 * consultorio o cambiar el precio de un producto no pertenece a ninguno — y
 * que `entity` lleva el prefijo `platform:` para poder separarlas.
 */

export const PLATFORM_PREFIX = "platform:";

export type PlatformEntity =
  | "clinic"
  | "clinic_user"
  | "product"
  | "subscription"
  | "billing_cycle"
  | "payment";

/**
 * Registra una acción del Master.
 *
 * Nunca lanza: una bitácora que falla no debe tumbar la operación que estaba
 * registrando. Si falla, se pierde el registro pero no el trabajo.
 */
export async function logPlatform(params: {
  masterUserId: string;
  action: AuditAction;
  entity: PlatformEntity;
  entityId?: string | null;
  /** Consultorio afectado, si la acción es sobre uno. */
  organizationId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await logAudit({
    organizationId: params.organizationId ?? null,
    userId: params.masterUserId,
    action: params.action,
    entity: `${PLATFORM_PREFIX}${params.entity}`,
    entityId: params.entityId ?? null,
    newValues: params.metadata,
  });
}

/** Bitácora de plataforma, con filtros. */
export async function listPlatformAudit(filter: {
  organizationId?: string;
  entity?: PlatformEntity;
  action?: AuditAction;
  limit?: number;
} = {}) {
  const where: Prisma.AuditLogWhereInput = {
    // Solo acciones de plataforma: las clínicas tienen su propia bitácora y no
    // deben mezclarse aquí.
    entity: filter.entity ? `${PLATFORM_PREFIX}${filter.entity}` : { startsWith: PLATFORM_PREFIX },
    organizationId: filter.organizationId,
    action: filter.action,
  };

  const rows = await db.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: filter.limit ?? 200,
    include: {
      user: { select: { fullName: true, email: true } },
      organization: { select: { name: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    action: r.action,
    entity: r.entity.replace(PLATFORM_PREFIX, ""),
    entityId: r.entityId,
    who: r.user?.fullName ?? "—",
    whoEmail: r.user?.email ?? null,
    clinic: r.organization?.name ?? null,
    metadata: r.newValues as Record<string, unknown> | null,
  }));
}
