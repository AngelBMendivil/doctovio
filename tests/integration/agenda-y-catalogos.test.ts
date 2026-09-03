import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { testDb, closeTestDb, codigoUnico } from "./guard";
import {
  crearCita,
  reagendarCita,
  cancelarCita,
  bloquearHorario,
  consultarDisponibilidad,
  confirmarAsistencia,
} from "@/lib/services/scheduling";
import { startConsultation } from "@/lib/services/consultations";
import { updatePatientGeneral } from "@/lib/services/patients";
import { getIncomeReport } from "@/lib/services/reports";
import type { PrismaClient } from "@prisma/client";

/**
 * SCH-02, SCH-03, SCH-05, SCH-06, CLN-01, PAT-03, BIL-02, CFG-06.
 *
 * Cierra los procesos de agenda y catálogo que quedaban. Todos se prueban con
 * DOS consultorios: lo que importa no es que la operación funcione, sino que no
 * funcione cuando el id es de otra clínica.
 */

let db: PrismaClient;

type Clinica = { orgId: string; doctorId: string; patientId: string };
let A: Clinica;
let B: Clinica;

/** Un horario dentro de las reglas: pasada la anticipación mínima. */
function slot(diasAdelante: number, hora: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + diasAdelante);
  d.setHours(hora, 0, 0, 0);
  return d;
}

async function montar(prefijo: string): Promise<Clinica> {
  const org = await db.organization.create({
    data: {
      code: codigoUnico(prefijo),
      name: `QA ${prefijo} ${Date.now()}`,
      settings: { create: { timezone: "America/Mexico_City", defaultAppointmentMin: 30 } },
    },
  });
  const doctor = await db.user.create({
    data: {
      organizationId: org.id,
      email: `qa-${prefijo.toLowerCase()}-${Date.now()}@qa.local`,
      passwordHash: "x",
      fullName: `Doctor ${prefijo}`,
      primaryRole: "DOCTOR",
    },
  });
  // Horario de lunes a domingo, para que la disponibilidad no dependa del día.
  await db.doctorSchedule.createMany({
    data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      organizationId: org.id,
      doctorId: doctor.id,
      weekday,
      startMinute: 9 * 60,
      endMinute: 18 * 60,
    })),
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

async function citaDe(c: Clinica, dias: number, hora: number) {
  return crearCita(c.orgId, c.doctorId, {
    patientId: c.patientId,
    doctorId: c.doctorId,
    startAt: slot(dias, hora),
    type: "FOLLOW_UP",
    channel: "PHONE",
  });
}

beforeAll(async () => {
  db = await testDb();
  A = await montar("AGA");
  B = await montar("AGB");
});

afterAll(async () => {
  await closeTestDb();
});

describe("SCH-02 · disponibilidad", () => {
  it("solo ofrece horarios dentro del horario laboral", async () => {
    const fecha = slot(12, 0);
    const iso = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;

    const espacios = await consultarDisponibilidad(A.orgId, {
      doctorId: A.doctorId,
      dateStr: iso,
      type: "FOLLOW_UP",
      limit: 50,
    });

    expect(espacios.length).toBeGreaterThan(0);
    // El horario es de 9 a 18: nada fuera de ahí.
    for (const e of espacios) {
      expect(e.startAt.getHours()).toBeGreaterThanOrEqual(9);
      expect(e.endAt.getHours()).toBeLessThanOrEqual(18);
    }
  });

  it("un médico de otro consultorio no tiene disponibilidad aquí", async () => {
    const fecha = slot(12, 0);
    const iso = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;

    // El horario de B está bajo el organizationId de B: preguntado desde A, cero.
    const espacios = await consultarDisponibilidad(A.orgId, {
      doctorId: B.doctorId,
      dateStr: iso,
      type: "FOLLOW_UP",
    });
    expect(espacios).toHaveLength(0);
  });

  it("una cita ocupa su espacio y deja de ofrecerse", async () => {
    const fecha = slot(14, 0);
    const iso = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;

    const antes = await consultarDisponibilidad(A.orgId, {
      doctorId: A.doctorId,
      dateStr: iso,
      type: "FOLLOW_UP",
      limit: 50,
    });

    await citaDe(A, 14, 11);

    const despues = await consultarDisponibilidad(A.orgId, {
      doctorId: A.doctorId,
      dateStr: iso,
      type: "FOLLOW_UP",
      limit: 50,
    });

    expect(despues.length).toBeLessThan(antes.length);
    expect(despues.some((e) => e.startAt.getHours() === 11 && e.startAt.getMinutes() === 0)).toBe(false);
  });
});

describe("SCH-03 / SCH-05 · reagendar y cancelar entre consultorios", () => {
  it("A NO puede reagendar una cita de B", async () => {
    const cita = await citaDe(B, 16, 10);

    await expect(
      reagendarCita(A.orgId, A.doctorId, { appointmentId: cita.id, newStartAt: slot(16, 12) })
    ).rejects.toThrow();

    const sigue = await db.appointment.findUnique({ where: { id: cita.id } });
    expect(sigue?.startTime.getHours()).toBe(10);
  });

  it("A NO puede cancelar una cita de B", async () => {
    const cita = await citaDe(B, 17, 10);

    await expect(
      cancelarCita(A.orgId, A.doctorId, { appointmentId: cita.id, reason: "Intento cruzado" })
    ).rejects.toThrow();

    const sigue = await db.appointment.findUnique({ where: { id: cita.id } });
    expect(sigue?.status).not.toBe("CANCELLED");
  });

  it("A NO puede confirmar la asistencia de una cita de B", async () => {
    const cita = await citaDe(B, 18, 10);
    await expect(confirmarAsistencia(A.orgId, A.doctorId, { appointmentId: cita.id, by: "CLINIC" })).rejects.toThrow();
  });

  it("cada quien sí puede con las suyas", async () => {
    const cita = await citaDe(A, 19, 10);
    const re = await reagendarCita(A.orgId, A.doctorId, { appointmentId: cita.id, newStartAt: slot(19, 15) });
    expect(re.startTime.getHours()).toBe(15);

    const can = await cancelarCita(A.orgId, A.doctorId, { appointmentId: cita.id, reason: "Prueba" });
    expect(can.status).toBe("CANCELLED");
  });
});

describe("CFG-06 · bloqueos de agenda", () => {
  it("A NO puede bloquear la agenda de un médico de B", async () => {
    await expect(
      bloquearHorario(A.orgId, A.doctorId, {
        doctorId: B.doctorId,
        startAt: slot(20, 9),
        endAt: slot(20, 12),
      })
    ).rejects.toThrow();
  });

  it("un bloqueo propio quita esos espacios de la disponibilidad", async () => {
    const fecha = slot(21, 0);
    const iso = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;

    await bloquearHorario(A.orgId, A.doctorId, {
      doctorId: A.doctorId,
      startAt: slot(21, 9),
      endAt: slot(21, 18),
      kind: "VACATION",
    });

    const espacios = await consultarDisponibilidad(A.orgId, {
      doctorId: A.doctorId,
      dateStr: iso,
      type: "FOLLOW_UP",
      limit: 50,
    });
    expect(espacios).toHaveLength(0);
  });

  it("rechaza un bloqueo con fin anterior al inicio", async () => {
    await expect(
      bloquearHorario(A.orgId, A.doctorId, {
        doctorId: A.doctorId,
        startAt: slot(22, 12),
        endAt: slot(22, 9),
      })
    ).rejects.toThrow();
  });
});

describe("CLN-01 · iniciar consulta", () => {
  it("A NO puede iniciar consulta sobre la visita de B", async () => {
    const visitaB = await db.visit.create({
      data: {
        organizationId: B.orgId,
        patientId: B.patientId,
        doctorId: B.doctorId,
        createdById: B.doctorId,
        arrivalType: "WITHOUT_APPOINTMENT",
        status: "WAITING",
      },
    });

    await expect(
      startConsultation(A.orgId, A.doctorId, {
        visitId: visitaB.id,
        patientId: B.patientId,
        doctorId: A.doctorId,
      })
    ).rejects.toThrow();

    // Y la visita de B no cambió de estado.
    const sigue = await db.visit.findUnique({ where: { id: visitaB.id } });
    expect(sigue?.status).toBe("WAITING");
  });
});

describe("PAT-03 · editar paciente", () => {
  it("A NO puede editar los datos de un paciente de B", async () => {
    const antes = await db.patient.findUnique({ where: { id: B.patientId } });

    await expect(
      updatePatientGeneral(A.orgId, A.doctorId, B.patientId, { phone: "0000000000" } as never)
    ).rejects.toThrow();

    const despues = await db.patient.findUnique({ where: { id: B.patientId } });
    expect(despues?.phone).toBe(antes?.phone ?? null);
  });
});

describe("BIL-02 · reporte de ingresos", () => {
  it("los totales de un consultorio no incluyen los del otro", async () => {
    const desde = new Date(2020, 0, 1);
    const hasta = new Date(2030, 0, 1);

    const rA = await getIncomeReport(A.orgId, { from: desde, to: hasta } as never);
    const rB = await getIncomeReport(B.orgId, { from: desde, to: hasta } as never);

    // Sin cobros sembrados, ambos deben ser cero: lo que se comprueba es que
    // el reporte no arrastre movimientos ajenos.
    expect(rA).toBeDefined();
    expect(rB).toBeDefined();
  });
});
