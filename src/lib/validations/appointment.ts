import { z } from "zod";

export const appointmentTypeEnum = z.enum(["FIRST_TIME", "FOLLOW_UP", "EXISTING_PATIENT"]);
export const appointmentChannelEnum = z.enum([
  "PHONE",
  "WHATSAPP",
  "EMAIL",
  "WALK_IN",
  "WEBSITE",
  "REFERRAL",
  "OTHER",
]);

export const createAppointmentSchema = z.object({
  patientId: z.string().min(1, "Selecciona un paciente"),
  doctorId: z.string().min(1, "Selecciona un médico"),
  branchId: z.string().optional(),
  scheduledDate: z.coerce.date({ required_error: "La fecha es obligatoria" }),
  startTime: z.coerce.date({ required_error: "La hora es obligatoria" }),
  durationMinutes: z.coerce.number().int().min(5).max(480).default(30),
  type: appointmentTypeEnum,
  reason: z.string().max(500).optional().or(z.literal("")),
  channel: appointmentChannelEnum.default("PHONE"),
  notes: z.string().max(1000).optional().or(z.literal("")),
  allowOverbook: z.boolean().default(false),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

/**
 * Agendar a un paciente de primera vez (aún no existe expediente).
 *
 * Estos son los datos MÍNIMOS para agendar. El resto de la historia clínica lo
 * captura el propio paciente en el prerregistro. La fecha de nacimiento es
 * obligatoria a propósito: sin ella la edad sale en cero y contamina dosis,
 * reportes y la propia búsqueda de duplicados.
 */
export const bookFirstTimeSchema = z.object({
  firstName: z.string().min(1, "El nombre es obligatorio").max(120),
  lastName1: z.string().min(1, "El primer apellido es obligatorio").max(120),
  lastName2: z.string().max(120).optional().or(z.literal("")),
  phone: z.string().min(10, "El teléfono es obligatorio para enviarle su prerregistro").max(30),
  email: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().email("Correo inválido").max(150).optional()
  ),
  birthDate: z.coerce.date({ required_error: "La fecha de nacimiento es obligatoria" }),
  /** Recepción confirmó que, pese a las coincidencias, es una persona distinta. */
  confirmedNotDuplicate: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()).default(false),
  doctorId: z.string().min(1, "Selecciona un médico"),
  scheduledDate: z.coerce.date({ required_error: "La fecha es obligatoria" }),
  startTime: z.coerce.date({ required_error: "La hora es obligatoria" }),
  durationMinutes: z.coerce.number().int().min(5).max(480).default(30),
  reason: z.string().max(500).optional().or(z.literal("")),
  allowOverbook: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
});

export type BookFirstTimeInput = z.infer<typeof bookFirstTimeSchema>;

export const rescheduleAppointmentSchema = z.object({
  appointmentId: z.string().min(1),
  scheduledDate: z.coerce.date(),
  startTime: z.coerce.date(),
  durationMinutes: z.coerce.number().int().min(5).max(480).default(30),
  reason: z.string().max(500).optional().or(z.literal("")),
});

export const cancelAppointmentSchema = z.object({
  appointmentId: z.string().min(1),
  reason: z.string().max(500).optional().or(z.literal("")),
});
