import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/**
 * PERTENENCIA AL CONSULTORIO.
 *
 * Los server actions arman su entrada con `Object.fromEntries(formData)`: los
 * `patientId`, `consultationId` y `visitId` llegan tal cual del navegador y
 * quien los manda decide su valor. Filtrar por `organizationId` al LEER no
 * alcanza — hay que comprobarlo antes de ESCRIBIR.
 *
 * Sin estas comprobaciones se pudieron reproducir, con pruebas:
 *   · escribir signos vitales en el expediente de un paciente de otra clínica
 *   · registrar un diagnóstico en la consulta de otra clínica
 *   · emitir una receta a nombre de un paciente ajeno
 *   · cerrar la consulta en curso de otro consultorio
 *
 * Todas lanzan en vez de devolver null: quien llama está a punto de escribir, y
 * un null que se ignora deja pasar la escritura. Los mensajes son genéricos a
 * propósito — confirmar "ese paciente existe pero no es tuyo" ya es información.
 */

type Cliente = Prisma.TransactionClient | typeof db;

export class TenantError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "TenantError";
  }
}

/** El paciente pertenece a este consultorio. */
export async function assertPatientInClinic(
  organizationId: string,
  patientId: string,
  client: Cliente = db
): Promise<void> {
  const existe = await client.patient.findFirst({
    where: { id: patientId, organizationId },
    select: { id: true },
  });
  if (!existe) throw new TenantError("El paciente no existe en este consultorio.");
}

/**
 * La consulta pertenece a este consultorio.
 *
 * Con `patientId`, comprueba ADEMÁS que la consulta sea de ese paciente: sin
 * eso, bastaría cruzar una consulta propia con un paciente ajeno.
 */
export async function assertConsultationInClinic(
  organizationId: string,
  consultationId: string,
  patientId?: string,
  client: Cliente = db
): Promise<void> {
  const existe = await client.consultation.findFirst({
    where: { id: consultationId, organizationId, ...(patientId ? { patientId } : {}) },
    select: { id: true },
  });
  if (!existe) {
    throw new TenantError(
      patientId
        ? "La consulta no existe en este consultorio, o no corresponde a ese paciente."
        : "La consulta no existe en este consultorio."
    );
  }
}

/** La visita pertenece a este consultorio. */
export async function assertVisitInClinic(
  organizationId: string,
  visitId: string,
  client: Cliente = db
): Promise<void> {
  const existe = await client.visit.findFirst({
    where: { id: visitId, organizationId },
    select: { id: true },
  });
  if (!existe) throw new TenantError("La visita no existe en este consultorio.");
}
