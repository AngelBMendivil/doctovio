import { z } from "zod";

export const createReferralSchema = z.object({
  patientId: z.string().min(1),
  toDoctorId: z.string().min(1, "Selecciona un médico receptor"),
  reason: z.string().min(1, "El motivo de referencia es obligatorio"),
  priority: z.enum(["NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  referentComments: z.string().max(2000).optional().or(z.literal("")),
  accessDays: z.coerce.number().int().min(1).max(180).default(30),
  patientAuthorized: z.boolean().refine((v) => v === true, {
    message: "Se requiere autorización del paciente para enviar la referencia",
  }),
  sharedFieldKeys: z.array(z.string()).min(1, "Selecciona al menos un dato a compartir"),
});

export type CreateReferralInput = z.infer<typeof createReferralSchema>;

export const referralResponseSchema = z.object({
  referralId: z.string().min(1),
  attendedConfirmed: z.boolean().default(true),
  generalAssessment: z.string().max(2000).optional().or(z.literal("")),
  generalDiagnosis: z.string().max(1000).optional().or(z.literal("")),
  recommendations: z.string().max(2000).optional().or(z.literal("")),
  followUp: z.string().max(1000).optional().or(z.literal("")),
  requestsReturn: z.boolean().default(false),
  comments: z.string().max(2000).optional().or(z.literal("")),
});
