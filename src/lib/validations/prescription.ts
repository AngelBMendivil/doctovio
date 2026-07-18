import { z } from "zod";

export const prescriptionItemSchema = z.object({
  medicationName: z.string().min(1, "El medicamento es obligatorio"),
  activeIngredient: z.string().max(160).optional().or(z.literal("")),
  presentation: z.string().max(120).optional().or(z.literal("")),
  quantityToDispense: z.string().max(120).optional().or(z.literal("")),
  dose: z.string().max(120).optional().or(z.literal("")),
  frequency: z.string().max(120).optional().or(z.literal("")),
  route: z.string().max(60).optional().or(z.literal("")),
  duration: z.string().max(60).optional().or(z.literal("")),
  instructions: z.string().max(500).optional().or(z.literal("")),
});

export const createPrescriptionSchema = z.object({
  patientId: z.string().min(1),
  consultationId: z.string().optional(),
  diagnosisText: z.string().max(1000).optional().or(z.literal("")),
  instructions: z.string().max(2000).optional().or(z.literal("")),
  recommendations: z.string().max(2000).optional().or(z.literal("")),
  items: z.array(prescriptionItemSchema).min(1, "Agrega al menos un medicamento"),
});

export type CreatePrescriptionInput = z.infer<typeof createPrescriptionSchema>;
