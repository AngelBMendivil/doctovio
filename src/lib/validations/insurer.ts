import { z } from "zod";

const optText = (max = 500) => z.string().max(max).optional().or(z.literal(""));
const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

/** Alta de una aseguradora en el catálogo. */
export const createInsurerSchema = z.object({
  name: z.string().min(1, "El nombre de la aseguradora es obligatorio").max(150),
  code: optText(40),
  contactPhone: optText(40),
  contactEmail: z.string().email("Correo inválido").optional().or(z.literal("")),
  requiresPreAuthorization: checkbox,
  authorizationInstructions: optText(2000),
  requiredDocuments: optText(4000),
  protocolNotes: optText(2000),
  coverageNotes: optText(2000),
});

export type CreateInsurerInput = z.infer<typeof createInsurerSchema>;

/** Edición de una aseguradora existente. */
export const updateInsurerSchema = createInsurerSchema.extend({
  id: z.string().min(1),
  isActive: checkbox,
});

export type UpdateInsurerInput = z.infer<typeof updateInsurerSchema>;

/** Ligar una aseguradora (del catálogo) a un paciente. */
export const linkInsuranceSchema = z.object({
  patientId: z.string().min(1),
  insurerId: z.string().min(1, "Selecciona una aseguradora"),
  policyNumber: optText(60),
  affiliateNumber: optText(60),
});

export type LinkInsuranceInput = z.infer<typeof linkInsuranceSchema>;

export const authStatusEnum = z.enum([
  "NOT_REQUIRED",
  "PENDING",
  "REQUESTED",
  "APPROVED",
  "REJECTED",
]);
