import type { Prisma } from "@prisma/client";

/**
 * Genera un folio consecutivo y único por organización y prefijo
 * ("RX" para recetas, "OM" para órdenes médicas).
 *
 * Formato: {PREFIX}-{YYYY}-{consecutivo de 6 dígitos}
 *
 * Se llama DENTRO de una transacción para que dos recetas simultáneas no
 * obtengan el mismo folio.
 *
 * Nota de tipos: no se guarda el modelo en una variable
 * (`prefix === "RX" ? tx.prescription : tx.medicalOrder`). Eso produce la
 * unión de dos modelos distintos y TypeScript ya no sabe llamar `count`:
 * sus firmas no son compatibles entre sí. Con un `if` cada rama conserva su
 * tipo concreto, que además es más claro de leer.
 */
export async function generateFolio(
  tx: Prisma.TransactionClient,
  organizationId: string,
  prefix: "RX" | "OM"
): Promise<string> {
  const year = new Date().getFullYear();
  const where = { organizationId, folio: { startsWith: `${prefix}-${year}-` } };

  const count =
    prefix === "RX" ? await tx.prescription.count({ where }) : await tx.medicalOrder.count({ where });

  return `${prefix}-${year}-${String(count + 1).padStart(6, "0")}`;
}
