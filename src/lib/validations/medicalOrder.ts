import { z } from "zod";

export const medicalOrderItemSchema = z.object({
  studyName: z.string().min(1, "El estudio es obligatorio"),
  notes: z.string().max(500).optional().or(z.literal("")),
});

export const createMedicalOrderSchema = z.object({
  patientId: z.string().min(1),
  consultationId: z.string().optional(),
  type: z.enum(["LAB", "IMAGING", "CLINICAL_STUDY", "THERAPY", "REFERRAL", "PROCEDURE", "OTHER"]),
  reason: z.string().max(1000).optional().or(z.literal("")),
  diagnosisText: z.string().max(1000).optional().or(z.literal("")),
  instructions: z.string().max(2000).optional().or(z.literal("")),
  priority: z.enum(["ROUTINE", "URGENT", "STAT"]).default("ROUTINE"),
  items: z.array(medicalOrderItemSchema).min(1, "Agrega al menos un estudio"),
});

export type CreateMedicalOrderInput = z.infer<typeof createMedicalOrderSchema>;
