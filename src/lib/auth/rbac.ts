import type { UserRoleName } from "@prisma/client";

/**
 * Matriz de permisos del MVP. Los asistentes NUNCA deben tener acceso a
 * acciones clínicas (diagnósticos, recetas, órdenes, notas clínicas,
 * referencias, firma de documentos clínicos).
 */
export const PERMISSIONS = {
  MANAGE_ORGANIZATION: ["ADMIN"],
  MANAGE_USERS: ["ADMIN"],
  MANAGE_CATALOGS: ["ADMIN"],
  VIEW_AUDIT_LOG: ["ADMIN"],
  MANAGE_BILLING: ["ADMIN", "DOCTOR", "ASSISTANT"],

  CREATE_PATIENT: ["ADMIN", "DOCTOR", "ASSISTANT"],
  EDIT_PATIENT_GENERAL: ["ADMIN", "DOCTOR", "ASSISTANT"],
  VIEW_PATIENT_RECORD: ["ADMIN", "DOCTOR", "ASSISTANT"],
  VIEW_RESTRICTED_CLINICAL_NOTES: ["ADMIN", "DOCTOR"],

  MANAGE_APPOINTMENTS: ["ADMIN", "DOCTOR", "ASSISTANT"],
  MANAGE_WAITING_ROOM: ["ADMIN", "DOCTOR", "ASSISTANT"],
  REGISTER_ARRIVAL: ["ADMIN", "DOCTOR", "ASSISTANT"],
  // Permite pasar a un paciente de primera vez SIN prerregistro completo.
  OVERRIDE_PREREGISTRATION: ["ADMIN", "DOCTOR"],

  START_CONSULTATION: ["ADMIN", "DOCTOR"],
  FINALIZE_CONSULTATION: ["ADMIN", "DOCTOR"],
  RECORD_VITAL_SIGNS: ["ADMIN", "DOCTOR", "ASSISTANT"],
  RECORD_DIAGNOSIS: ["ADMIN", "DOCTOR"],
  ISSUE_PRESCRIPTION: ["ADMIN", "DOCTOR"],
  ISSUE_MEDICAL_ORDER: ["ADMIN", "DOCTOR"],
  CANCEL_PRESCRIPTION: ["ADMIN", "DOCTOR"],

  UPLOAD_CLINICAL_DOCUMENT: ["ADMIN", "DOCTOR"],
  UPLOAD_ADMIN_DOCUMENT: ["ADMIN", "DOCTOR", "ASSISTANT"],

  SEND_REFERRAL: ["ADMIN", "DOCTOR"],
  RESPOND_REFERRAL: ["ADMIN", "DOCTOR"],

  // --- Módulo dental. Se EXTIENDE esta matriz, no se crea otra: un segundo
  // sistema de permisos es un segundo lugar donde olvidar una regla.
  //
  // La línea que importa: el asistente puede VER el odontograma y mover el
  // estado COMERCIAL de una cotización, pero no toca el expediente clínico.
  // Marcar un tratamiento como realizado es un acto clínico, no comercial.
  VIEW_DENTAL_CHART: ["ADMIN", "DOCTOR", "ASSISTANT"],
  EDIT_DENTAL_CHART: ["ADMIN", "DOCTOR"],
  MANAGE_DENTAL_TREATMENT: ["ADMIN", "DOCTOR"],

  VIEW_PRODUCTS: ["ADMIN", "DOCTOR", "ASSISTANT"],
  MANAGE_PRODUCTS: ["ADMIN"],

  VIEW_QUOTES: ["ADMIN", "DOCTOR", "ASSISTANT"],
  CREATE_QUOTES: ["ADMIN", "DOCTOR", "ASSISTANT"],
  MANAGE_QUOTES: ["ADMIN", "DOCTOR", "ASSISTANT"],
  /// Cobrar distinto al precio de catálogo. Ver `lib/services/treatment-plan.ts`.
  OVERRIDE_PRICE: ["ADMIN", "DOCTOR"],
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export function hasPermission(role: UserRoleName, permission: PermissionKey): boolean {
  return (PERMISSIONS[permission] as readonly UserRoleName[]).includes(role);
}

export function assertPermission(role: UserRoleName, permission: PermissionKey) {
  if (!hasPermission(role, permission)) {
    throw new Error(`FORBIDDEN: el rol ${role} no tiene permiso ${permission}`);
  }
}
