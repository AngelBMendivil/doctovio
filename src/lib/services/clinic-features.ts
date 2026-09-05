import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import type { ClinicType } from "@prisma/client";

/**
 * QUÉ MÓDULOS VE CADA CONSULTORIO.
 *
 * El giro (`Organization.type`) decide qué se MUESTRA, no qué existe: Doctovio
 * es una sola plataforma y una sola base. Un consultorio médico simplemente no
 * ve nada dental, y si mañana se apaga el módulo entero nada del core cambia.
 *
 * NO viaja en el JWT. Podría —el giro casi nunca cambia—, pero el token vive 7
 * días y ya nos pasó con `clinicActive`: un dato congelado ahí adentro tarda una
 * semana en enterarse de la realidad. Se lee de la base y `cache()` de React lo
 * deduplica dentro del mismo request, así que una pantalla que pregunte cinco
 * veces hace UNA consulta.
 */
type CargarGiro = (organizationId: string) => Promise<ClinicType>;

/**
 * `cache()` solo existe dentro del runtime de servidor de React. Fuera de Next
 * —en las pruebas de integración, por ejemplo— no está definida, y llamarla
 * revienta el módulo al importarlo. Cuando no está, la función se usa tal cual:
 * se pierde la deduplicación, que es una optimización, no una regla.
 */
const memoizar: (fn: CargarGiro) => CargarGiro = typeof cache === "function" ? cache : (fn) => fn;

export const getClinicType = memoizar(async (organizationId: string): Promise<ClinicType> => {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { type: true },
  });
  // Sin consultorio no hay módulo que habilitar. MEDICAL es el comportamiento
  // de siempre, que es el que no rompe nada.
  return org?.type ?? "MEDICAL";
});

export async function isDentalClinic(organizationId: string): Promise<boolean> {
  return (await getClinicType(organizationId)) === "DENTAL";
}

/**
 * Cierra la puerta del lado del servidor.
 *
 * Ocultar el enlace en la barra lateral no protege nada: la ruta sigue ahí y se
 * escribe a mano. Toda acción del módulo dental pasa por aquí antes de tocar la
 * base, igual que el resto del sistema comprueba el consultorio antes de
 * escribir en vez de confiar en lo que mandó el formulario.
 */
export async function assertDentalClinic(organizationId: string): Promise<void> {
  if (!(await isDentalClinic(organizationId))) {
    throw new Error("Este consultorio no tiene habilitado el módulo dental.");
  }
}
