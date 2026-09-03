import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { testDb, closeTestDb, codigoUnico } from "./guard";
import { crearCita } from "@/lib/services/scheduling";
import type { PrismaClient } from "@prisma/client";

/**
 * SCH-04 — doble reserva del mismo horario.
 *
 * El caso: dos personas confirman el mismo espacio al mismo tiempo. Pasa de
 * verdad — la recepcionista agendando por teléfono mientras el paciente
 * confirma por WhatsApp, o simplemente un doble clic.
 *
 * Si el motor deja pasar las dos, dos pacientes llegan a la misma hora y el
 * médico se entera en la sala de espera. No hay forma de arreglarlo después:
 * alguien se va a tener que ir.
 *
 * NO BORRA NADA: consultorio propio con código único en cada corrida.
 */

let db: PrismaClient;
let orgId: string;
let doctorId: string;
let pacienteA: string;
let pacienteB: string;

/** Un horario cómodamente dentro de las reglas: ni muy pronto ni muy lejos. */
function horarioLibre(offsetHoras = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + 10);
  d.setHours(10 + offsetHoras, 0, 0, 0);
  return d;
}

beforeAll(async () => {
  db = await testDb();

  const org = await db.organization.create({
    data: {
      code: codigoUnico("SCH"),
      name: `QA Doble reserva ${Date.now()}`,
      settings: { create: { timezone: "America/Mexico_City", defaultAppointmentMin: 30 } },
    },
  });
  orgId = org.id;

  const doctor = await db.user.create({
    data: {
      organizationId: orgId,
      email: `qa-sch-${Date.now()}@qa.local`,
      passwordHash: "x",
      fullName: "QA Doctor Agenda",
      primaryRole: "DOCTOR",
    },
  });
  doctorId = doctor.id;

  const [a, b] = await Promise.all([
    db.patient.create({
      data: {
        organizationId: orgId,
        recordNumber: `QA-A-${Date.now()}`,
        firstName: "Ana",
        lastLastName: "Paciente",
        birthDate: new Date("1990-01-01"),
        sex: "FEMALE",
      },
    }),
    db.patient.create({
      data: {
        organizationId: orgId,
        recordNumber: `QA-B-${Date.now()}`,
        firstName: "Beto",
        lastLastName: "Paciente",
        birthDate: new Date("1985-01-01"),
        sex: "MALE",
      },
    }),
  ]);
  pacienteA = a.id;
  pacienteB = b.id;
});

afterAll(async () => {
  await closeTestDb();
});

describe("SCH-04 · doble reserva del mismo horario", () => {
  it("dos confirmaciones SIMULTÁNEAS del mismo espacio: solo una debe quedar", async () => {
    const slot = horarioLibre(0);

    const resultados = await Promise.allSettled([
      crearCita(orgId, doctorId, {
        patientId: pacienteA,
        doctorId,
        startAt: slot,
        type: "FOLLOW_UP",
        channel: "PHONE",
      }),
      crearCita(orgId, doctorId, {
        patientId: pacienteB,
        doctorId,
        startAt: slot,
        type: "FOLLOW_UP",
        channel: "WHATSAPP",
      }),
    ]);

    const creadas = await db.appointment.count({
      where: { organizationId: orgId, doctorId, startTime: slot, isActive: true },
    });

    const exitosas = resultados.filter((r) => r.status === "fulfilled").length;

    // Lo que importa es la BASE, no lo que devolvió cada llamada: dos citas
    // para el mismo médico a la misma hora son dos pacientes en la puerta.
    expect(creadas).toBe(1);
    expect(exitosas).toBe(1);
  });

  it("una confirmación SECUENCIAL sobre un espacio ocupado se rechaza", async () => {
    // El camino sin concurrencia sí funcionaba: sirve de control para
    // distinguir "la validación no existe" de "la validación llega tarde".
    const slot = horarioLibre(2);

    await crearCita(orgId, doctorId, {
      patientId: pacienteA,
      doctorId,
      startAt: slot,
      type: "FOLLOW_UP",
      channel: "PHONE",
    });

    await expect(
      crearCita(orgId, doctorId, {
        patientId: pacienteB,
        doctorId,
        startAt: slot,
        type: "FOLLOW_UP",
        channel: "PHONE",
      })
    ).rejects.toThrow();
  });

  it("cinco confirmaciones simultáneas: solo una queda", async () => {
    const slot = horarioLibre(4);

    await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        crearCita(orgId, doctorId, {
          patientId: pacienteA,
          doctorId,
          startAt: slot,
          type: "FOLLOW_UP",
          channel: "PHONE",
        })
      )
    );

    const creadas = await db.appointment.count({
      where: { organizationId: orgId, doctorId, startTime: slot, isActive: true },
    });
    expect(creadas).toBe(1);
  });

  it("citas que se TRASLAPAN parcialmente también se bloquean", async () => {
    // Una cita de 30 min a las 14:00 y otra a las 14:15 se enciman: el médico
    // no puede estar en las dos.
    const base = horarioLibre(6);
    const encimada = new Date(base.getTime() + 15 * 60_000);

    await crearCita(orgId, doctorId, {
      patientId: pacienteA,
      doctorId,
      startAt: base,
      type: "FOLLOW_UP",
      channel: "PHONE",
    });

    await expect(
      crearCita(orgId, doctorId, {
        patientId: pacienteB,
        doctorId,
        startAt: encimada,
        type: "FOLLOW_UP",
        channel: "PHONE",
      })
    ).rejects.toThrow();
  });

  it("dos médicos distintos SÍ pueden tener cita a la misma hora", async () => {
    // El bloqueo es por médico, no por consultorio: dos consultorios y dos
    // médicos atienden en paralelo.
    const otroDoctor = await db.user.create({
      data: {
        organizationId: orgId,
        email: `qa-sch2-${Date.now()}@qa.local`,
        passwordHash: "x",
        fullName: "QA Doctor 2",
        primaryRole: "DOCTOR",
      },
    });

    const slot = horarioLibre(8);

    const r = await Promise.allSettled([
      crearCita(orgId, doctorId, {
        patientId: pacienteA,
        doctorId,
        startAt: slot,
        type: "FOLLOW_UP",
        channel: "PHONE",
      }),
      crearCita(orgId, otroDoctor.id, {
        patientId: pacienteB,
        doctorId: otroDoctor.id,
        startAt: slot,
        type: "FOLLOW_UP",
        channel: "PHONE",
      }),
    ]);

    expect(r.filter((x) => x.status === "fulfilled").length).toBe(2);
  });
});
