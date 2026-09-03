import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { testDb, closeTestDb, codigoUnico } from "./guard";
import { createAndSendReferral, closeReferral } from "@/lib/services/referrals";
import { submitPreRegistration, createPreRegistrationToken } from "@/lib/services/preregistration";
import { createUserAsMaster } from "@/lib/services/platform-users";
import { setClinicStatus } from "@/lib/services/clinics";
import { listInsurers } from "@/lib/services/insurers";
import type { PrismaClient } from "@prisma/client";

/**
 * REF-01, PAT-04, TEN-02, TEN-04, CFG-01.
 *
 * Las referencias son el caso delicado: cruzan consultorios POR DISEÑO, así que
 * un fallo ahí no se ve raro — el sistema está hecho para compartir. Por eso la
 * autorización tiene que ser explícita en cada operación.
 */

let db: PrismaClient;

type Clinica = { orgId: string; doctorId: string; patientId: string };
let A: Clinica;
let B: Clinica;

async function montar(prefijo: string): Promise<Clinica> {
  const org = await db.organization.create({
    data: { code: codigoUnico(prefijo), name: `QA ${prefijo} ${Date.now()}`, maxUsers: 3 },
  });
  const doctor = await db.user.create({
    data: {
      organizationId: org.id,
      email: `qa-${prefijo.toLowerCase()}-${Date.now()}@qa.local`,
      passwordHash: "x",
      fullName: `Doctor ${prefijo}`,
      primaryRole: "DOCTOR",
      doctorProfile: { create: { organizationId: org.id, specialty: "General" } },
    },
  });
  const paciente = await db.patient.create({
    data: {
      organizationId: org.id,
      recordNumber: `QA-${prefijo}-${Date.now()}`,
      firstName: prefijo,
      lastLastName: "Paciente",
      birthDate: new Date("1990-01-01"),
      sex: "FEMALE",
      medicalProfile: { create: {} },
      medicalHistory: { create: {} },
    },
  });
  return { orgId: org.id, doctorId: doctor.id, patientId: paciente.id };
}

beforeAll(async () => {
  db = await testDb();
  A = await montar("RFA");
  B = await montar("RFB");
});

afterAll(async () => {
  await closeTestDb();
});

describe("REF-01 · referencias entre consultorios", () => {
  it("A NO puede referir a un paciente de B (exfiltración del expediente)", async () => {
    // El caso grave: la referencia arma un resumen con nombre, edad, alergias,
    // crónicos y medicación. Con el patientId de B, ese resumen viajaría a un
    // tercer médico. No es escribir donde no debe: es sacar el expediente
    // ajeno por la puerta diseñada para compartir.
    await expect(
      createAndSendReferral(A.orgId, A.doctorId, {
        patientId: B.patientId,
        toDoctorId: B.doctorId,
        reason: "Intento de exfiltración",
        sharedFieldKeys: ["name", "age", "allergies"],
      } as never)
    ).rejects.toThrow();

    expect(await db.medicalReferral.count({ where: { patientId: B.patientId } })).toBe(0);
  });

  it("A sí puede referir a su propio paciente", async () => {
    const r = await createAndSendReferral(A.orgId, A.doctorId, {
      patientId: A.patientId,
      toDoctorId: B.doctorId,
      reason: "Referencia legítima",
      sharedFieldKeys: ["name", "age"],
      priority: "NORMAL",
      patientAuthorized: true,
      accessDays: 30,
    } as never);

    expect(r.organizationFromId).toBe(A.orgId);
    expect(r.organizationToId).toBe(B.orgId);
  });

  it("un tercero NO puede cerrar una referencia ajena", async () => {
    const referencia = await createAndSendReferral(A.orgId, A.doctorId, {
      patientId: A.patientId,
      toDoctorId: B.doctorId,
      reason: "Para cerrar",
      sharedFieldKeys: ["name"],
      priority: "NORMAL",
      patientAuthorized: true,
      accessDays: 30,
    } as never);

    const C = await montar("RFC");
    await expect(closeReferral(C.orgId, C.doctorId, referencia.id)).rejects.toThrow();

    const sigue = await db.medicalReferral.findUnique({ where: { id: referencia.id } });
    expect(sigue?.status).not.toBe("CLOSED");
  });
});

describe("PAT-04 · token público de prerregistro", () => {
  it("un token no se puede reutilizar", async () => {
    const t = await createPreRegistrationToken(A.orgId);
    const payload = { firstName: "Publico", lastName1: "Prueba" } as never;

    await submitPreRegistration(t.token, payload);
    // El segundo envío con el mismo enlace debe rechazarse.
    await expect(submitPreRegistration(t.token, payload)).rejects.toThrow();
  });

  it("un token inventado no sirve", async () => {
    await expect(submitPreRegistration("token-que-no-existe", {} as never)).rejects.toThrow();
  });
});

describe("TEN-02 · suspensión de consultorio", () => {
  it("suspender apaga isActive y NO borra nada", async () => {
    const antesPacientes = await db.patient.count({ where: { organizationId: B.orgId } });

    await setClinicStatus(B.orgId, "SUSPENDED");
    const susp = await db.organization.findUnique({ where: { id: B.orgId } });
    expect(susp?.isActive).toBe(false);
    expect(susp?.status).toBe("SUSPENDED");

    // Lo que importa: los datos siguen ahí.
    expect(await db.patient.count({ where: { organizationId: B.orgId } })).toBe(antesPacientes);

    // Y al reactivar, vuelve como estaba.
    await setClinicStatus(B.orgId, "ACTIVE");
    const react = await db.organization.findUnique({ where: { id: B.orgId } });
    expect(react?.isActive).toBe(true);
    expect(await db.patient.count({ where: { organizationId: B.orgId } })).toBe(antesPacientes);
  });

  it("cancelar tampoco borra información", async () => {
    const antes = await db.patient.count({ where: { organizationId: B.orgId } });
    await setClinicStatus(B.orgId, "CANCELLED");
    expect(await db.patient.count({ where: { organizationId: B.orgId } })).toBe(antes);
    await setClinicStatus(B.orgId, "ACTIVE");
  });
});

describe("TEN-04 · tope de usuarios del plan", () => {
  it("no deja pasar del límite contratado", async () => {
    const org = await db.organization.create({
      data: { code: codigoUnico("LIM"), name: `QA Limite ${Date.now()}`, maxUsers: 2 },
    });

    await createUserAsMaster({
      organizationId: org.id,
      email: `lim1-${Date.now()}@qa.local`,
      password: "Prueba12345",
      fullName: "Uno Prueba",
      role: "DOCTOR",
    });
    await createUserAsMaster({
      organizationId: org.id,
      email: `lim2-${Date.now()}@qa.local`,
      password: "Prueba12345",
      fullName: "Dos Prueba",
      role: "ASSISTANT",
    });

    // El tercero excede el plan de 2.
    await expect(
      createUserAsMaster({
        organizationId: org.id,
        email: `lim3-${Date.now()}@qa.local`,
        password: "Prueba12345",
        fullName: "Tres Prueba",
        role: "ASSISTANT",
      })
    ).rejects.toThrow();

    expect(await db.user.count({ where: { organizationId: org.id } })).toBe(2);
  });

  it("el correo no se puede repetir entre consultorios", async () => {
    const correo = `repetido-${Date.now()}@qa.local`;
    await createUserAsMaster({
      organizationId: A.orgId,
      email: correo,
      password: "Prueba12345",
      fullName: "Original Prueba",
      role: "ASSISTANT",
    });

    await expect(
      createUserAsMaster({
        organizationId: B.orgId,
        email: correo,
        password: "Prueba12345",
        fullName: "Duplicado Prueba",
        role: "ASSISTANT",
      })
    ).rejects.toThrow();
  });
});

describe("CFG-01 · catálogo de aseguradoras", () => {
  it("cada consultorio ve solo las suyas", async () => {
    await db.insurer.create({ data: { organizationId: A.orgId, name: `Aseguradora A ${Date.now()}` } });

    const deA = await listInsurers(A.orgId);
    const deB = await listInsurers(B.orgId);

    expect(deA.length).toBeGreaterThan(0);
    expect(deB.some((i) => deA.some((a) => a.id === i.id))).toBe(false);
  });
});
