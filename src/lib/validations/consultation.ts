import { z } from "zod";

export const createConsultationSchema = z.object({
  visitId: z.string().min(1),
  patientId: z.string().min(1),
  appointmentId: z.string().optional(),
  type: z.enum(["GENERAL", "FOLLOW_UP", "SPECIALTY", "URGENT", "OTHER"]).default("GENERAL"),
  reason: z.string().max(1000).optional().or(z.literal("")),
});

export const updateConsultationSchema = z.object({
  consultationId: z.string().min(1),
  currentIllness: z.string().max(4000).optional().or(z.literal("")),
  physicalExam: z.string().max(4000).optional().or(z.literal("")),
  assessment: z.string().max(4000).optional().or(z.literal("")),
  plan: z.string().max(4000).optional().or(z.literal("")),
  treatment: z.string().max(4000).optional().or(z.literal("")),
  instructions: z.string().max(4000).optional().or(z.literal("")),
  prognosis: z.string().max(1000).optional().or(z.literal("")),
  followUp: z.string().max(1000).optional().or(z.literal("")),
  followUpDate: z.coerce.date().optional(),
  observations: z.string().max(2000).optional().or(z.literal("")),
});

// Un campo numerico vacio en un formulario llega como "" y z.coerce.number()
// lo convertiria en 0, disparando los minimos (p.ej. respiratoryRate >= 4).
// Este helper trata "" / null / undefined como "sin dato" (undefined).
const optionalNumber = (schema: z.ZodTypeAny) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    schema.optional()
  );

export const vitalSignSchema = z.object({
  consultationId: z.string().min(1),
  patientId: z.string().min(1),
  weightKg: optionalNumber(z.coerce.number().positive()),
  heightCm: optionalNumber(z.coerce.number().positive()),
  temperatureC: optionalNumber(z.coerce.number().min(30).max(45)),
  systolicPressure: optionalNumber(z.coerce.number().int().min(40).max(300)),
  diastolicPressure: optionalNumber(z.coerce.number().int().min(20).max(200)),
  heartRate: optionalNumber(z.coerce.number().int().min(20).max(260)),
  respiratoryRate: optionalNumber(z.coerce.number().int().min(4).max(80)),
  oxygenSaturation: optionalNumber(z.coerce.number().int().min(0).max(100)),
  glucose: optionalNumber(z.coerce.number().min(0).max(900)),
  painScale: optionalNumber(z.coerce.number().int().min(0).max(10)),
  observations: z.string().max(1000).optional().or(z.literal("")),
});

export const diagnosisSchema = z.object({
  consultationId: z.string().min(1),
  patientId: z.string().min(1),
  label: z.string().min(1, "El diagnóstico es obligatorio"),
  type: z.enum(["PRESUMPTIVE", "CONFIRMED", "DIFFERENTIAL", "CHRONIC", "RESOLVED"]).default("PRESUMPTIVE"),
  code: z.string().max(20).optional().or(z.literal("")),
  description: z.string().max(2000).optional().or(z.literal("")),
});
