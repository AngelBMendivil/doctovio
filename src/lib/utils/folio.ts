import type { Prisma } from "@prisma/client";

/**
 * FOLIOS CONSECUTIVOS POR CONSULTORIO.
 *
 * Único generador para recetas (RX), órdenes médicas (OM) y citas (DOC). Antes
 * había tres copias del mismo `count() + 1`, y las tres tenían el mismo error.
 *
 * EL ERROR: estar dentro de una transacción NO evita que dos folios simultáneos
 * choquen. En READ COMMITTED —el nivel por defecto de Postgres— dos
 * transacciones concurrentes cuentan lo mismo, porque ninguna ve el INSERT sin
 * confirmar de la otra. Las dos calculan N+1. El `@@unique([organizationId,
 * folio])` impide el duplicado en la base, pero la segunda muere con un error
 * crudo de llave duplicada que nadie atrapa: el médico termina la consulta,
 * emite la receta y recibe una pantalla de error.
 *
 * LA SOLUCIÓN: tomar un candado sobre la fila del consultorio antes de contar.
 * El candado se libera al confirmar la transacción, así que la segunda espera,
 * y cuando cuenta ya ve la fila de la primera. Se serializa la emisión de
 * folios POR CONSULTORIO, que es exactamente lo que hace falta y nada más: dos
 * consultorios distintos no se estorban.
 *
 * Es más simple que reintentar el error de llave duplicada y no depende de que
 * quien llama recuerde envolverlo en un reintento.
 */

export type FolioPrefix = "RX" | "OM" | "DOC";

/** Cuenta los folios ya emitidos del prefijo. Cada rama conserva su tipo. */
async function contarEmitidos(
  tx: Prisma.TransactionClient,
  organizationId: string,
  prefix: FolioPrefix,
  startsWith: string
): Promise<number> {
  // No se guarda el modelo en una variable: la unión de dos modelos distintos
  // deja a TypeScript sin saber llamar `count`, porque sus firmas no son
  // compatibles. Con ramas separadas cada una conserva su tipo concreto.
  if (prefix === "RX") {
    return tx.prescription.count({ where: { organizationId, folio: { startsWith } } });
  }
  if (prefix === "OM") {
    return tx.medicalOrder.count({ where: { organizationId, folio: { startsWith } } });
  }
  return tx.appointment.count({ where: { organizationId, folio: { startsWith } } });
}

/**
 * Genera el siguiente folio. DEBE llamarse dentro de una transacción.
 *
 * Formato:
 *   RX-2026-000123   receta
 *   OM-2026-000123   orden médica
 *   DOC-000123       cita (sin año: el paciente lo dicta por WhatsApp)
 */
export async function generateFolio(
  tx: Prisma.TransactionClient,
  organizationId: string,
  prefix: FolioPrefix
): Promise<string> {
  // El candado es lo que vuelve segura la operación. Sin esta línea, dos
  // emisiones simultáneas del mismo consultorio calculan el mismo número.
  await tx.$executeRaw`SELECT id FROM organizations WHERE id = ${organizationId} FOR UPDATE`;

  // Las citas no llevan año en el folio: son cortas de dictar por teléfono.
  const startsWith = prefix === "DOC" ? "DOC-" : `${prefix}-${new Date().getFullYear()}-`;

  const count = await contarEmitidos(tx, organizationId, prefix, startsWith);
  return `${startsWith}${formatConsecutivo(count + 1)}`;
}

/** Consecutivo a 6 dígitos: 1 → "000001". */
export function formatConsecutivo(n: number): string {
  return String(n).padStart(6, "0");
}

/**
 * Siguiente número de expediente: EXP-2026-00001.
 *
 * Mismo candado que los folios, y por la misma razón. Antes se calculaba con un
 * `count()` FUERA de cualquier transacción: dos altas simultáneas obtenían el
 * mismo número y la segunda moría con llave duplicada, en la cara de la
 * recepcionista que estaba dando de alta a un paciente.
 *
 * Formato aparte del de los folios (5 dígitos, con año) porque es lo que ya
 * está impreso en los expedientes existentes: cambiarlo rompería la
 * continuidad de la numeración del consultorio.
 */
export async function generateRecordNumber(
  tx: Prisma.TransactionClient,
  organizationId: string
): Promise<string> {
  await tx.$executeRaw`SELECT id FROM organizations WHERE id = ${organizationId} FOR UPDATE`;

  const count = await tx.patient.count({ where: { organizationId } });
  return `EXP-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;
}

/**
 * Parte un folio en sus piezas. Devuelve null si no tiene el formato esperado.
 *
 * La usa el asistente de WhatsApp: el paciente dicta su folio y hay que
 * reconocerlo aunque lo escriba en minúsculas o con espacios.
 */
export function parseFolio(
  folio: string
): { prefix: FolioPrefix; year: number | null; consecutivo: number } | null {
  const limpio = folio.trim().toUpperCase().replace(/\s+/g, "");

  const conAnio = /^(RX|OM)-(\d{4})-(\d{1,10})$/.exec(limpio);
  if (conAnio) {
    return {
      prefix: conAnio[1] as FolioPrefix,
      year: Number(conAnio[2]),
      consecutivo: Number(conAnio[3]),
    };
  }

  const sinAnio = /^(DOC)-(\d{1,10})$/.exec(limpio);
  if (sinAnio) {
    return { prefix: "DOC", year: null, consecutivo: Number(sinAnio[2]) };
  }

  return null;
}
