"use server";

import { requireSession } from "@/lib/auth/session";
import { assertPermission } from "@/lib/auth/rbac";
import { findPossibleDuplicates } from "@/lib/services/patients";
import { calculateAge } from "@/lib/utils/age";

/**
 * Búsqueda de coincidencias al agendar.
 *
 * Es la pieza central del flujo: aquí se decide si un paciente es nuevo o ya
 * existe. Nadie debe crear un expediente sin haber pasado por aquí.
 *
 * Devuelve solo datos de identificación —nunca clínicos— porque el resultado
 * se muestra en pantalla antes de saber si quien agenda tiene derecho a ver el
 * expediente completo.
 */
export type PatientMatch = {
  id: string;
  recordNumber: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  age: number;
  /** Qué campo hizo el match: le dice a recepción por qué salió este candidato. */
  reasons: string[];
};

export async function findPatientMatchesAction(input: {
  firstName?: string;
  lastName1?: string;
  phone?: string;
  email?: string;
  birthDate?: string;
}): Promise<PatientMatch[]> {
  const session = await requireSession();
  assertPermission(session.role, "CREATE_PATIENT");

  const firstName = input.firstName?.trim() || undefined;
  const lastName1 = input.lastName1?.trim() || undefined;
  const phone = input.phone?.replace(/\D/g, "") || undefined;
  const email = input.email?.trim().toLowerCase() || undefined;
  const birthDate = input.birthDate ? new Date(`${input.birthDate}T00:00:00`) : undefined;

  // Con datos sueltos la búsqueda devolvería medio catálogo: se exige algo con
  // poder discriminante (nombre completo, teléfono, correo o fecha).
  const hasName = Boolean(firstName && lastName1);
  if (!hasName && !phone && !email && !birthDate) return [];

  const candidates = await findPossibleDuplicates(session.organizationId, {
    firstName: hasName ? firstName : undefined,
    lastName1: hasName ? lastName1 : undefined,
    phone,
    email,
    birthDate: birthDate && !Number.isNaN(birthDate.getTime()) ? birthDate : undefined,
  });

  return candidates.map((p) => {
    const reasons: string[] = [];
    if (hasName && p.firstName.toLowerCase() === firstName!.toLowerCase() && p.lastLastName.toLowerCase() === lastName1!.toLowerCase()) {
      reasons.push("nombre");
    }
    if (phone && (p.phone ?? "").replace(/\D/g, "") === phone) reasons.push("teléfono");
    if (email && p.email?.toLowerCase() === email) reasons.push("correo");
    if (birthDate && p.birthDate.toISOString().slice(0, 10) === birthDate.toISOString().slice(0, 10)) {
      reasons.push("fecha de nacimiento");
    }

    return {
      id: p.id,
      recordNumber: p.recordNumber,
      fullName: `${p.firstName} ${p.lastLastName} ${p.secondLastName ?? ""}`.trim(),
      phone: p.phone,
      email: p.email,
      age: calculateAge(p.birthDate),
      reasons,
    };
  });
}
