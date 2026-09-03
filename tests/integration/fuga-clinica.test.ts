import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { testDb, closeTestDb, codigoUnico } from "./guard";
import { recordVitalSigns, getLatestVitalSigns } from "@/lib/services/vitalSigns";
import { getPatientById, createPatient } from "@/lib/services/patients";
import { startConsultation, finalizeConsultation } from "@/lib/services/consultations";
import { createDiagnosis } from "@/lib/services/diagnoses";
import { issuePrescription } from "@/lib/services/prescriptions";
import { createVisit } from "@/lib/services/visits";
import type { PrismaClient } from "@prisma/client";

/**
 * TEN-03 / CLN-02 / PAT-02 — fuga de datos clínicos entre consultorios.
 *
 * Dos consultorios completos, A y B, con paciente y consulta propios. Se
 * intenta desde A tocar lo de B, que es el caso negativo que pide la matriz:
 * "URL con id ajeno", "IDOR", "paciente de otro tenant".
 *
 * Estas pruebas llaman a los SERVICIOS reales, no replican su lógica. Es la
 * diferencia entre comprobar que el filtro existe y comprobar que se aplica.
 */

let db: PrismaClient;

type Clinica = { orgId: string; doctorId: string; patientId: string; consultationId: string };
let A: Clinica;
let B: Clinica;

async function montarClinica(prefijo: string): Promise<Clinica> {
  const org = await db.organization.create({
    data: {
      code: codigoUnico(prefijo),
      name: `QA ${prefijo} ${Date.now()}`,
      settings: { create: { timezone: "America/Mexico_City" } },
    },
  });

  const doctor = await db.user.create({
    data: {
      organizationId: org.id,
      email: `qa-${prefijo.toLowerCase()}-${Date.now()}@qa.local`,
      passwordHash: "x",
      fullName: `QA Doctor ${prefijo}`,
      primaryRole: "DOCTOR",
    },
  });

  const paciente = await createPatient(org.id, doctor.id, {
    firstName: prefijo === "FGA" ? "Ana" : "Beto",
    lastName1: "Paciente",
    birthDate: new Date("1990-01-01"),
    sex: "FEMALE",
  } as never);

  const visita = await db.visit.create({
    data: {
      organizationId: org.id,
      patientId: paciente.id,
      doctorId: doctor.id,
      arrivalType: "WITH_APPOINTMENT",
      createdById: doctor.id,
      status: "IN_CONSULTATION",
    },
  });

  const consulta = await startConsultation(org.id, doctor.id, {
    visitId: visita.id,
    patientId: paciente.id,
    doctorId: doctor.id,
    type: "GENERAL",
  } as never);

  return { orgId: org.id, doctorId: doctor.id, patientId: paciente.id, consultationId: consulta.id };
}

beforeAll(async () => {
  db = await testDb();
  A = await montarClinica("FGA");
  B = await montarClinica("FGB");
});

afterAll(async () => {
  await closeTestDb();
});

describe("TEN-03 · lectura cruzada entre consultorios", () => {
  it("A no puede leer el expediente de un paciente de B", async () => {
    expect(await getPatientById(A.orgId, B.patientId)).toBeNull();
  });

  it("cada consultorio sí ve el suyo", async () => {
    expect(await getPatientById(A.orgId, A.patientId)).not.toBeNull();
    expect(await getPatientById(B.orgId, B.patientId)).not.toBeNull();
  });
});

describe("CLN-02 · signos vitales entre consultorios", () => {
  it("A NO debe poder escribir signos vitales en el paciente de B", async () => {
    // El caso real: un usuario de A manda el formulario con el patientId y el
    // consultationId de B. La acción los toma directo del formulario.
    //
    // Escribir presión arterial o glucosa falsas en el expediente de un
    // paciente ajeno es corrupción de datos clínicos, no solo una fuga.
    await expect(
      recordVitalSigns(A.orgId, A.doctorId, {
        consultationId: B.consultationId,
        patientId: B.patientId,
        systolicPressure: 190,
        diastolicPressure: 120,
        glucose: 400,
      } as never)
    ).rejects.toThrow();

    const enB = await db.vitalSign.count({ where: { patientId: B.patientId } });
    expect(enB).toBe(0);
  });

  it("A sí puede escribir en su propio paciente", async () => {
    await recordVitalSigns(A.orgId, A.doctorId, {
      consultationId: A.consultationId,
      patientId: A.patientId,
      weightKg: 70,
      heightCm: 175,
    } as never);

    const ultimo = await getLatestVitalSigns(A.orgId, A.patientId);
    expect(ultimo).not.toBeNull();
    // El IMC se calcula al guardar: 70 / 1.75² = 22.9
    expect(ultimo?.bmi).toBe(22.9);
  });

  it("A NO puede leer los signos vitales del paciente de B", async () => {
    await recordVitalSigns(B.orgId, B.doctorId, {
      consultationId: B.consultationId,
      patientId: B.patientId,
      weightKg: 60,
      heightCm: 160,
    } as never);

    // Con el id correcto pero el consultorio equivocado: no debe devolver nada.
    expect(await getLatestVitalSigns(A.orgId, B.patientId)).toBeNull();
    // Y B sí ve lo suyo.
    expect(await getLatestVitalSigns(B.orgId, B.patientId)).not.toBeNull();
  });
});

describe("CLN-03 · diagnósticos entre consultorios", () => {
  it("A NO puede registrar un diagnóstico en la consulta de B", async () => {
    // Un diagnóstico es una afirmación clínica formal. Escribirlo en el
    // expediente de otro consultorio es de lo más grave que puede pasar aquí.
    await expect(
      createDiagnosis(A.orgId, A.doctorId, {
        consultationId: B.consultationId,
        patientId: B.patientId,
        label: "Diagnóstico inyectado desde otra clínica",
        type: "CONFIRMED",
      } as never)
    ).rejects.toThrow();

    expect(await db.diagnosis.count({ where: { consultationId: B.consultationId } })).toBe(0);
  });

  it("A sí puede en la suya", async () => {
    const d = await createDiagnosis(A.orgId, A.doctorId, {
      consultationId: A.consultationId,
      patientId: A.patientId,
      label: "Diagnóstico propio",
      type: "PRESUMPTIVE",
    } as never);
    expect(d.id).toBeTruthy();
  });
});

describe("CLN-04 · finalizar consulta ajena", () => {
  it("A NO puede cerrar la consulta EN CURSO de B", async () => {
    // Finalizar bloquea la edición: cerrar la consulta de otro médico a media
    // captura le congela el expediente.
    await expect(finalizeConsultation(A.orgId, A.doctorId, B.consultationId)).rejects.toThrow();

    const c = await db.consultation.findUnique({ where: { id: B.consultationId }, select: { status: true } });
    expect(c?.status).toBe("IN_PROGRESS");
  });
});

describe("CLN-03 · recetas a pacientes ajenos", () => {
  it("A NO puede emitir una receta a nombre del paciente de B", async () => {
    await expect(
      issuePrescription(A.orgId, A.doctorId, {
        patientId: B.patientId,
        consultationId: A.consultationId,
        items: [{ drug: "Paracetamol", dose: "500mg", frequency: "c/8h", duration: "3 días" }],
      } as never)
    ).rejects.toThrow();

    expect(await db.prescription.count({ where: { patientId: B.patientId } })).toBe(0);
  });
});

describe("PAT-02 · visitas con paciente ajeno", () => {
  it("A NO puede abrir una visita con el paciente de B", async () => {
    await expect(
      createVisit(A.orgId, A.doctorId, {
        patientId: B.patientId,
        doctorId: A.doctorId,
        arrivalType: "WITHOUT_APPOINTMENT",
        priority: "NORMAL",
      } as never)
    ).rejects.toThrow();
  });
});
