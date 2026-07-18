import { z } from "zod";

// Convierte "" / null / undefined en undefined; deja el resto igual.
const emptyToUndef = (v: unknown) =>
  v === "" || v === null || v === undefined ? undefined : v;

const optionalText = (max = 255) =>
  z.preprocess(emptyToUndef, z.string().max(max).optional());

/** Datos generales del consultorio / organización. */
export const organizationProfileSchema = z.object({
  name: z.string().min(1, "El nombre del consultorio es obligatorio").max(200),
  legalName: optionalText(200),
});

/** Dirección de la sucursal principal. */
export const branchSchema = z.object({
  name: z.string().min(1, "El nombre de la sucursal es obligatorio").max(150),
  address: optionalText(300),
  country: z.preprocess(emptyToUndef, z.enum(["MX", "US"]).optional()),
  state: optionalText(120),
  city: optionalText(120),
  postalCode: optionalText(20),
  phone: optionalText(40),
});

/** Alta de un usuario (asistente, médico o admin). */
export const createUserSchema = z.object({
  fullName: z.string().min(1, "El nombre es obligatorio").max(200),
  email: z.string().email("Correo inválido"),
  phone: optionalText(40),
  role: z.enum(["ADMIN", "DOCTOR", "ASSISTANT"]),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(100),
});

/** Edición de un usuario existente (el correo no se cambia). La contraseña es opcional:
 *  si se deja vacía, se conserva la actual. */
export const updateUserSchema = z.object({
  userId: z.string().min(1),
  fullName: z.string().min(1, "El nombre es obligatorio").max(200),
  phone: optionalText(40),
  role: z.enum(["ADMIN", "DOCTOR", "ASSISTANT"]),
  password: z.preprocess(
    emptyToUndef,
    z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(100).optional()
  ),
});

/** Perfil profesional del médico. */
export const doctorProfileSchema = z.object({
  userId: z.string().min(1),
  specialty: optionalText(150),
  subspecialty: optionalText(150),
  licenseNumber: optionalText(60),
  specialtyLicense: optionalText(60),
  licensesText: optionalText(1000),
  ssaNumber: optionalText(60),
  stateRegistration: optionalText(60),
  rfc: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toUpperCase() : v),
    optionalText(20)
  ),
  professionalPhone: optionalText(40),
  professionalEmail: z.preprocess(
    emptyToUndef,
    z.string().email("Correo profesional inválido").max(150).optional()
  ),
  city: optionalText(120),
  state: optionalText(120),
});

export type OrganizationProfileInput = z.infer<typeof organizationProfileSchema>;
export type BranchInput = z.infer<typeof branchSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type DoctorProfileInput = z.infer<typeof doctorProfileSchema>;
