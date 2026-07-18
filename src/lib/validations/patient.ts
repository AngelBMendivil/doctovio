import { z } from "zod";

export const patientSexEnum = z.enum(["MALE", "FEMALE", "UNDETERMINED"]);
export const maritalStatusEnum = z
  .enum(["SINGLE", "MARRIED", "DIVORCED", "WIDOWED", "FREE_UNION", "OTHER"])
  .optional();

export const createPatientSchema = z.object({
  firstName: z.string().min(1, "El nombre es obligatorio").max(120),
  lastName1: z.string().min(1, "El primer apellido es obligatorio").max(120),
  lastName2: z.string().max(120).optional().or(z.literal("")),
  birthDate: z.coerce.date({ required_error: "La fecha de nacimiento es obligatoria" }),
  sex: patientSexEnum,
  gender: z.string().max(60).optional().or(z.literal("")),
  curp: z.string().max(18).optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  email: z.string().email("Correo inválido").optional().or(z.literal("")),
  address: z.string().max(255).optional().or(z.literal("")),
  city: z.string().max(120).optional().or(z.literal("")),
  state: z.string().max(120).optional().or(z.literal("")),
  postalCode: z.string().max(12).optional().or(z.literal("")),
  country: z.string().max(60).default("MX"),
  occupation: z.string().max(120).optional().or(z.literal("")),
  maritalStatus: maritalStatusEnum,
  adminNotes: z.string().max(2000).optional().or(z.literal("")),
});

export type CreatePatientInput = z.infer<typeof createPatientSchema>;

/** Alta rápida usada desde "Agregar paciente sin cita". */
export const quickAdmitPatientSchema = z.object({
  fullName: z.string().min(1, "El nombre completo es obligatorio"),
  birthDateOrAge: z.string().min(1, "Captura fecha de nacimiento o edad aproximada"),
  phone: z.string().max(30).optional().or(z.literal("")),
  doctorId: z.string().min(1, "Selecciona un médico"),
  reason: z.string().min(1, "El motivo es obligatorio"),
  careType: z.string().min(1),
});

export type QuickAdmitPatientInput = z.infer<typeof quickAdmitPatientSchema>;

export const duplicateSearchSchema = z.object({
  firstName: z.string().optional(),
  lastName1: z.string().optional(),
  birthDate: z.coerce.date().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  curp: z.string().optional(),
});
