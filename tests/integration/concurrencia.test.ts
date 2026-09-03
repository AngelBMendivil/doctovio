import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { testDb, closeTestDb, codigoUnico } from "./guard";
import { generateFolio } from "@/lib/utils/folio";
import { createPatient } from "@/lib/services/patients";
import type { PrismaClient } from "@prisma/client";

/**
 * SCH-01 / CLN-03 / ORD-01 — folios bajo concurrencia.
 *
 * Es la prueba que motivó montar una base de pruebas: no se puede validar
 * concurrencia sin escribir.
 *
 * QUÉ SE PRUEBA EXACTAMENTE. El contrato de `generateFolio` no es "devuelve un
 * número distinto cada vez": es "folio + inserción, dentro de la MISMA
 * transacción, nunca chocan". El consecutivo sale de contar las filas ya
 * emitidas, así que sin insertar nada el contador no avanza — pedir dos folios
 * sin guardar nada devuelve el mismo, y está bien que así sea.
 *
 * Lo que el candado sobre la fila del consultorio garantiza es que la segunda
 * transacción ESPERE a que la primera confirme, y entonces ya cuente su fila.
 * Sin el candado ambas cuentan lo mismo y la segunda muere con un error crudo
 * de llave duplicada: el médico termina la consulta, emite la receta y recibe
 * una pantalla de error.
 *
 * ESTAS PRUEBAS NO BORRAN NADA. Cada corrida crea su propio consultorio con
 * código único y lo deja ahí. Es una base de pruebas: que crezca no importa, y
 * a cambio desaparece la posibilidad de que un borrado mal filtrado toque algo
 * que no debe.
 */

let db: PrismaClient;
let orgId: string;
let doctorId: string;
let patientId: string;

/** Crea una cita completa, tomando el folio en la misma transacción. */
async function crearCitaConFolio(organizationId: string) {
  return db.$transaction(async (tx) => {
    const folio = await generateFolio(tx, organizationId, "DOC");
    return tx.appointment.create({
      data: {
        organizationId,
        patientId,
        doctorId,
        createdById: doctorId,
        scheduledDate: new Date("2027-01-15T12:00:00"),
        startTime: new Date("2027-01-15T16:00:00"),
        type: "FOLLOW_UP",
        folio,
      },
      select: { folio: true },
    });
  });
}

beforeAll(async () => {
  db = await testDb();

  const org = await db.organization.create({
    data: { code: codigoUnico("FOL"), name: `QA Folios ${Date.now()}` },
  });
  orgId = org.id;

  const doctor = await db.user.create({
    data: {
      organizationId: orgId,
      email: `qa-doctor-${Date.now()}@qa.local`,
      passwordHash: "x",
      fullName: "QA Doctor",
      primaryRole: "DOCTOR",
    },
  });
  doctorId = doctor.id;

  const paciente = await db.patient.create({
    data: {
      organizationId: orgId,
      recordNumber: `QA-${Date.now()}`,
      firstName: "QA",
      lastLastName: "Paciente",
      birthDate: new Date("1990-01-01"),
      sex: "FEMALE",
    },
  });
  patientId = paciente.id;
});

afterAll(async () => {
  await closeTestDb();
});

describe("folios bajo concurrencia", () => {
  it("dos citas simultáneas obtienen folios DISTINTOS", async () => {
    // El doble clic del usuario, o dos recepcionistas guardando a la vez.
    const [a, b] = await Promise.all([crearCitaConFolio(orgId), crearCitaConFolio(orgId)]);

    expect(a.folio).not.toBe(b.folio);
  });

  it("diez citas simultáneas dan diez folios distintos, sin errores", async () => {
    // Sin el candado, aquí explotaría con un error de llave duplicada.
    const citas = await Promise.all(Array.from({ length: 10 }, () => crearCitaConFolio(orgId)));
    const folios = citas.map((c) => c.folio);

    expect(new Set(folios).size).toBe(10);
  });

  it("los folios son consecutivos, sin huecos", async () => {
    const todos = await db.appointment.findMany({
      where: { organizationId: orgId, folio: { not: null } },
      select: { folio: true },
    });

    const numeros = todos.map((c) => Number(c.folio!.replace("DOC-", ""))).sort((a, b) => a - b);
    expect(numeros[0]).toBe(1);
    expect(numeros[numeros.length - 1]).toBe(numeros.length);
  });

  it("dos consultorios distintos NO se bloquean ni comparten serie", async () => {
    // El candado es por consultorio, no global.
    const otra = await db.organization.create({
      data: { code: codigoUnico("FOB"), name: `QA Folios B ${Date.now()}` },
    });

    const folio = await db.$transaction((tx) => generateFolio(tx, otra.id, "DOC"));

    // Cada consultorio numera su propia serie desde el 1.
    expect(folio).toBe("DOC-000001");
  });

  it("la base rechaza un folio duplicado aunque el código fallara", async () => {
    // Última red: el @@unique([organizationId, folio]). Si algún día alguien
    // quita el candado, esto es lo que impide dos recetas con el mismo folio.
    const existente = await db.appointment.findFirst({
      where: { organizationId: orgId, folio: { not: null } },
      select: { folio: true },
    });

    await expect(
      db.appointment.create({
        data: {
          organizationId: orgId,
          patientId,
          doctorId,
          createdById: doctorId,
          scheduledDate: new Date("2027-01-15T12:00:00"),
          startTime: new Date("2027-01-15T17:00:00"),
          type: "FOLLOW_UP",
          folio: existente!.folio,
        },
      })
    ).rejects.toThrow();
  });

  it("PAT-01 · diez altas de paciente simultáneas dan diez expedientes distintos", async () => {
    // Dos recepcionistas registrando a la vez. Antes el numero se calculaba
    // fuera de toda transaccion: ambas obtenian el mismo y la segunda moria
    // con llave duplicada mientras alguien daba de alta a un paciente.
    const altas = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        createPatient(orgId, doctorId, {
          firstName: `Concurrente${i}`,
          lastName1: "Prueba",
          birthDate: new Date("1990-01-01"),
          sex: "FEMALE",
          country: "MX",
        } as never)
      )
    );

    const numeros = altas.map((p) => p.recordNumber);
    expect(new Set(numeros).size).toBe(10);
  });
});
