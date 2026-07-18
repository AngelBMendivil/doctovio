import { db } from "@/lib/db";

/**
 * Genera un folio consecutivo y único por organización y prefijo
 * (ej. "RX" para recetas, "OM" para órdenes médicas), usando una
 * transacción para evitar folios duplicados bajo concurrencia.
 *
 * Formato: {PREFIX}-{YYYY}-{consecutivo de 6 dígitos}
 */
export async function generateFolio(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0] extends infer T ? T : never,
  organizationId: string,
  prefix: "RX" | "OM"
): Promise<string> {
  const year = new Date().getFullYear();
  const model = prefix === "RX" ? (tx as typeof db).prescription : (tx as typeof db).medicalOrder;

  const count = await model.count({
    where: {
      organizationId,
      folio: { startsWith: `${prefix}-${year}-` },
    },
  });

  const consecutive = String(count + 1).padStart(6, "0");
  return `${prefix}-${year}-${consecutive}`;
}
