import { db } from "@/lib/db";
import type { AuditAction } from "@prisma/client";

type LogAuditParams = {
  organizationId: string;
  userId?: string | null;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
};

/**
 * Registro de auditoría transversal. Se invoca desde toda mutación o
 * consulta sensible (login, alta de paciente, emisión de receta,
 * descarga de documento, consulta de referencia, etc.).
 * Nunca debe bloquear la operación principal: los errores se silencian
 * a un log de servidor para no tumbar el flujo del usuario.
 */
export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        organizationId: params.organizationId,
        userId: params.userId ?? null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId ?? null,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
        oldValues: params.oldValues as never,
        newValues: params.newValues as never,
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[audit] no se pudo registrar la bitácora:", error);
  }
}
