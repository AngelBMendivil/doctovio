import { z } from "zod";

/**
 * Validaciones del módulo dental.
 *
 * Mismo estilo que el resto: los formularios llegan como `FormData` y todo lo
 * numérico viene en texto, así que se convierte aquí y no a mano en la acción.
 */

const optText = (max = 500) => z.string().max(max).optional().or(z.literal(""));
const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

/** Precio: acepta "850", "850.00" y "" (que vale 0). Nunca negativo. */
const money = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? 0 : Number(String(v).replace(/[^0-9.-]/g, ""))),
  z.number().min(0, "El importe no puede ser negativo").max(9_999_999)
);

const moneyOpt = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? undefined : Number(String(v).replace(/[^0-9.-]/g, ""))),
  z.number().min(0).max(9_999_999).optional()
);

export const surfaceEnum = z.enum([
  "VESTIBULAR",
  "PALATAL_LINGUAL",
  "MESIAL",
  "DISTAL",
  "OCCLUSAL_INCISAL",
  "WHOLE",
]);

// ---------------------------------------------------------------------------
// Catálogo del consultorio
// ---------------------------------------------------------------------------

export const catalogItemSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio").max(150),
  code: optText(40),
  type: z.enum(["SERVICE", "PRODUCT"]),
  categoryId: optText(40),
  description: optText(1000),
  price: money,
  taxRate: moneyOpt,
});

export type CatalogItemFormInput = z.infer<typeof catalogItemSchema>;

export const updateCatalogItemSchema = catalogItemSchema.extend({
  id: z.string().min(1),
  isActive: checkbox,
});

export const categorySchema = z.object({
  name: z.string().min(1, "La categoría necesita un nombre").max(80),
});

// ---------------------------------------------------------------------------
// Odontograma
// ---------------------------------------------------------------------------

export const odontogramEntrySchema = z.object({
  patientId: z.string().min(1),
  toothCode: z.string().min(2).max(2),
  kind: z.enum(["FINDING", "TREATMENT"]),
  code: z.string().min(1, "Elige qué se encontró o qué se hizo"),
  notes: optText(1000),
  consultationId: optText(40),
  /** Fecha en que ocurrió, si no fue hoy. */
  recordedAt: optText(20),
});

export const cancelEntrySchema = z.object({
  patientId: z.string().min(1),
  entryId: z.string().min(1),
  motivo: z.string().min(3, "Escribe por qué se corrige: queda en el expediente").max(500),
});

// ---------------------------------------------------------------------------
// Plan de tratamiento
// ---------------------------------------------------------------------------

export const planItemSchema = z.object({
  patientId: z.string().min(1),
  toothCode: optText(2),
  diagnosis: optText(300),
  treatmentCode: z.string().min(1, "Elige el tratamiento"),
  catalogItemId: optText(40),
  unitPrice: moneyOpt,
  quantity: z.preprocess((v) => (v === "" || v == null ? 1 : Number(v)), z.number().int().min(1).max(99)),
  discount: money,
  notes: optText(1000),
  findingEntryId: optText(40),
  consultationId: optText(40),
});

export const treatmentStatusSchema = z.object({
  patientId: z.string().min(1),
  id: z.string().min(1),
  status: z.enum(["PENDING", "ACCEPTED", "IN_PROGRESS", "CANCELLED"]),
});

export const completeTreatmentSchema = z.object({
  patientId: z.string().min(1),
  id: z.string().min(1),
  performedAt: optText(20),
  notes: optText(1000),
  consultationId: optText(40),
});

// ---------------------------------------------------------------------------
// Cotizaciones
// ---------------------------------------------------------------------------

export const createQuoteSchema = z.object({
  patientId: z.string().min(1),
  validDays: z.preprocess((v) => (v === "" || v == null ? 30 : Number(v)), z.number().int().min(0).max(365)),
  extraDiscount: money,
  notes: optText(1000),
  terms: optText(2000),
});

export const quoteStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["DRAFT", "SENT", "ACCEPTED", "REJECTED", "PARTIAL", "CANCELLED"]),
});
