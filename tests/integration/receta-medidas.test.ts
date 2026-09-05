import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { testDb, closeTestDb, codigoUnico } from "./guard";
import { getMeasurementsForDocument } from "@/lib/services/vitalSigns";
import type { PrismaClient } from "@prisma/client";

/**
 * TALLA Y PESO EN LA RECETA.
 *
 * Lo que se prueba es la parte que se puede hacer mal sin que nadie lo note:
 * imprimir el peso de hoy en una receta de hace dos años, o dejar la talla en
 * blanco teniéndola registrada tres meses antes.
 */

let db: PrismaClient;

type Escenario = { orgId: string; doctorId: string; patientId: string };

async function montar(prefijo: string): Promise<Escenario> {
  const org = await db.organization.create({
    data: { code: codigoUnico(prefijo), name: `QA Medidas ${prefijo} ${Date.now()}` },
  });
  const doctor = await db.user.create({
    data: {
      organizationId: org.id,
      email: `qa-medidas-${prefijo.toLowerCase()}-${Date.now()}@qa.local`,
      passwordHash: "x",
      fullName: `Doctor ${prefijo}`,
      primaryRole: "DOCTOR",
    },
  });
  const paciente = await db.patient.create({
    data: {
      organizationId: org.id,
      recordNumber: `QA-MED-${prefijo}-${Date.now()}`,
      firstName: prefijo,
      lastLastName: "Paciente",
      birthDate: new Date("1985-05-05"),
      sex: "MALE",
    },
  });
  return { orgId: org.id, doctorId: doctor.id, patientId: paciente.id };
}

/** Una consulta con su visita, que es lo que exige el modelo. */
async function consultaCon(
  e: Escenario,
  cuando: Date,
  signos: { weightKg?: number; heightCm?: number } | null
) {
  const visita = await db.visit.create({
    data: {
      organizationId: e.orgId,
      patientId: e.patientId,
      doctorId: e.doctorId,
      createdById: e.doctorId,
      arrivalType: "WITHOUT_APPOINTMENT",
      status: "COMPLETED",
      arrivalTime: cuando,
    },
  });
  const consulta = await db.consultation.create({
    data: {
      organizationId: e.orgId,
      patientId: e.patientId,
      doctorId: e.doctorId,
      visitId: visita.id,
      date: cuando,
      status: "COMPLETED",
    },
  });
  if (signos) {
    await db.vitalSign.create({
      data: {
        consultationId: consulta.id,
        patientId: e.patientId,
        recordedById: e.doctorId,
        recordedAt: cuando,
        weightKg: signos.weightKg ?? null,
        heightCm: signos.heightCm ?? null,
      },
    });
  }
  return consulta;
}

const dia = (offsetDias: number) => new Date(Date.now() + offsetDias * 86_400_000);

let A: Escenario;
let B: Escenario;

beforeAll(async () => {
  db = await testDb();
  A = await montar("MA");
  B = await montar("MB");
});

afterAll(async () => {
  await closeTestDb();
});

describe("de dónde salen la talla y el peso", () => {
  it("sin ninguna toma devuelve nulos: la receta imprime la etiqueta en blanco", async () => {
    const medidas = await getMeasurementsForDocument(A.orgId, A.patientId);
    expect(medidas).toEqual({ weightKg: null, heightCm: null });
  });

  it("toma los valores de la consulta de la que salió la receta", async () => {
    const primera = await consultaCon(A, dia(-180), { weightKg: 80, heightCm: 175 });
    const medidas = await getMeasurementsForDocument(A.orgId, A.patientId, {
      consultationId: primera.id,
    });
    expect(medidas).toEqual({ weightKg: 80, heightCm: 175 });
  });

  it("completa la talla con la toma anterior cuando la consulta solo pesó", async () => {
    // Es el caso normal en seguimiento: se vuelve a pesar, no a medir. Dejar la
    // talla vacía teniéndola de hace meses sería perder un dato que sí existe.
    const seguimiento = await consultaCon(A, dia(-30), { weightKg: 76 });

    const medidas = await getMeasurementsForDocument(A.orgId, A.patientId, {
      consultationId: seguimiento.id,
    });
    expect(medidas.weightKg).toBe(76);
    expect(medidas.heightCm).toBe(175);
  });

  it("una receta vieja NO se reimprime con el peso de hoy", async () => {
    await consultaCon(A, dia(-1), { weightKg: 71, heightCm: 175 });

    // Documento emitido hace tres meses: solo puede ver lo de antes.
    const medidas = await getMeasurementsForDocument(A.orgId, A.patientId, {
      hasta: dia(-90),
    });
    expect(medidas.weightKg).toBe(80);

    // Y el de hoy sí ve lo último.
    const hoy = await getMeasurementsForDocument(A.orgId, A.patientId);
    expect(hoy.weightKg).toBe(71);
  });

  it("sin consulta usa la última toma del paciente", async () => {
    const medidas = await getMeasurementsForDocument(A.orgId, A.patientId);
    expect(medidas.weightKg).toBe(71);
    expect(medidas.heightCm).toBe(175);
  });

  it("no lee los signos vitales de un paciente de otro consultorio", async () => {
    await consultaCon(B, dia(-2), { weightKg: 99, heightCm: 150 });

    // Con el id del paciente de B pero el consultorio de A: nada.
    const cruzado = await getMeasurementsForDocument(A.orgId, B.patientId);
    expect(cruzado).toEqual({ weightKg: null, heightCm: null });

    // Y el propio A sigue viendo lo suyo, sin contaminarse.
    const propio = await getMeasurementsForDocument(A.orgId, A.patientId);
    expect(propio.weightKg).toBe(71);
  });
});
