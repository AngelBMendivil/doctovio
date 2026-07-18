import { z } from "zod";

// Checkbox de HTML: llega "on" cuando está marcado, o no llega. -> boolean.
const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
const optText = (max = 500) => z.string().max(max).optional().or(z.literal(""));

/**
 * Formulario que el PACIENTE llena en el enlace público de prerregistro.
 * Los datos se guardan tal cual en PublicFormToken.payloadJson y luego el
 * consultorio los revisa y convierte en un expediente real.
 */
export const preRegistrationSchema = z.object({
  // --- Datos personales ---
  firstName: z.string().min(1, "El nombre es obligatorio").max(120),
  lastName1: z.string().min(1, "El primer apellido es obligatorio").max(120),
  lastName2: optText(120),
  birthDate: z.string().min(1, "La fecha de nacimiento es obligatoria"),
  sex: z.enum(["MALE", "FEMALE", "UNDETERMINED"], { required_error: "Selecciona el sexo" }),
  curp: optText(18),
  phone: optText(30),
  email: z.string().email("Correo inválido").optional().or(z.literal("")),
  occupation: optText(120),
  maritalStatus: z
    .enum(["SINGLE", "MARRIED", "DIVORCED", "WIDOWED", "FREE_UNION", "OTHER"])
    .optional()
    .or(z.literal("")),

  // --- Domicilio ---
  address: optText(255),
  country: z.enum(["MX", "US"]).default("MX"),
  state: optText(120),
  city: optText(120),
  postalCode: optText(12),

  // --- Contacto de emergencia ---
  emergencyContactName: optText(200),
  emergencyContactRelationship: optText(100),
  emergencyContactPhone: optText(30),

  // --- Aseguradora (opcional, del catálogo del consultorio) ---
  insurerId: optText(40),
  insurancePolicyNumber: optText(60),
  insuranceAffiliateNumber: optText(60),

  // --- Alergias, enfermedades crónicas y medicación (una por línea) ---
  allergies: optText(4000),
  chronicConditions: optText(4000),
  currentMedications: optText(4000),

  // --- Antecedentes heredofamiliares ---
  familyDiabetes: checkbox,
  familyHypertension: checkbox,
  familyCancer: checkbox,
  familyHeartDisease: checkbox,
  familyHereditaryDisease: checkbox,
  familyCancerTypes: optText(500),
  familyOthers: optText(1000),
  /** El paciente declaró no tener antecedentes familiares relevantes. */
  noFamily: checkbox,

  // --- Antecedentes personales / estilo de vida ---
  smoking: optText(500),
  alcohol: optText(500),
  exercise: optText(500),
  diet: optText(500),
  substanceUse: optText(500),
  surgeriesNotes: optText(1000),
  hospitalizationsNotes: optText(1000),
  priorDiseases: optText(1000),
});

export type PreRegistrationPayload = z.infer<typeof preRegistrationSchema>;
