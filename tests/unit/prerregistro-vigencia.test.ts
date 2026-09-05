import { describe, it, expect } from "vitest";
import { finDelDiaEn, fechaEnZona } from "@/lib/utils/timezone";
import { preRegExpiry, MIN_HORAS_PREREGISTRO } from "@/lib/services/preregistration";

/**
 * VIGENCIA DEL ENLACE DE PRERREGISTRO.
 *
 * Regresión de un fallo que se vio en producción: un enlace creado a las 19:09
 * de Tijuana venció a las 23:59:59 UTC del día anterior, o sea DOS HORAS ANTES
 * de existir. El paciente abrió el enlace recién recibido y leyó "el enlace
 * expiró".
 *
 * La causa fue `setHours(23,59,59)`, que usa la zona del servidor — y el
 * servidor corre en UTC.
 */

describe("fin del día en la zona del consultorio", () => {
  it("en Tijuana el día termina a las 06:59:59.999Z del día siguiente", () => {
    // Septiembre: horario de verano del Pacífico, UTC-7.
    const instante = new Date("2026-09-04T18:00:00.000Z");
    expect(finDelDiaEn(instante, "America/Tijuana").toISOString()).toBe("2026-09-05T06:59:59.999Z");
  });

  it("en la Ciudad de México termina una hora antes: no tiene horario de verano", () => {
    // México eliminó el horario de verano en 2022, así que el centro del país
    // es UTC-6 todo el año mientras la frontera norte sí lo conserva.
    const instante = new Date("2026-09-04T18:00:00.000Z");
    expect(finDelDiaEn(instante, "America/Mexico_City").toISOString()).toBe("2026-09-05T05:59:59.999Z");
  });

  it("respeta el invierno, cuando Tijuana es UTC-8", () => {
    const enero = new Date("2026-01-15T18:00:00.000Z");
    expect(finDelDiaEn(enero, "America/Tijuana").toISOString()).toBe("2026-01-16T07:59:59.999Z");
  });

  it("un instante que en UTC ya es del día siguiente sigue siendo hoy en Tijuana", () => {
    // 02:09Z del 5 de septiembre son las 19:09 del 4 en Tijuana. Este es
    // exactamente el instante en que se generó el enlace que falló.
    const instante = new Date("2026-09-05T02:09:34.594Z");
    expect(fechaEnZona(instante, "America/Tijuana")).toEqual({ y: 2026, m: 9, d: 4 });
    expect(fechaEnZona(instante, "UTC")).toEqual({ y: 2026, m: 9, d: 5 });
  });
});

describe("preRegExpiry", () => {
  /** El caso real, con los datos que quedaron en la base. */
  const creadoEn = new Date("2026-09-05T02:09:34.594Z");
  const citaDeHoy = new Date("2026-09-04T18:00:00.000Z");

  it("NUNCA devuelve una fecha ya pasada", () => {
    const expira = preRegExpiry(citaDeHoy, "America/Tijuana", creadoEn);
    expect(expira.getTime()).toBeGreaterThan(creadoEn.getTime());
  });

  it("reproduce el fallo: con la regla vieja el enlace nacía vencido", () => {
    // La regla vieja: fin del día en la zona del SERVIDOR (UTC).
    const reglaVieja = new Date(citaDeHoy);
    reglaVieja.setUTCHours(23, 59, 59, 999);
    expect(reglaVieja.getTime()).toBeLessThan(creadoEn.getTime()); // nació muerto

    // La nueva no.
    expect(preRegExpiry(citaDeHoy, "America/Tijuana", creadoEn).getTime()).toBeGreaterThan(
      creadoEn.getTime()
    );
  });

  it("da al menos 48 horas para llenar la historia clínica", () => {
    const expira = preRegExpiry(citaDeHoy, "America/Tijuana", creadoEn);
    const horas = (expira.getTime() - creadoEn.getTime()) / 3_600_000;
    expect(horas).toBeGreaterThanOrEqual(MIN_HORAS_PREREGISTRO);
  });

  it("para una cita lejana manda el fin de SU día, no el piso de 48 horas", () => {
    const enUnMes = new Date("2026-10-04T18:00:00.000Z");
    const expira = preRegExpiry(enUnMes, "America/Tijuana", creadoEn);
    expect(expira.toISOString()).toBe("2026-10-05T06:59:59.999Z");
  });

  it("una cita de mañana temprano no deja al paciente sin la noche de hoy", () => {
    // Agendada a las 19:00 de Tijuana para las 9 de la mañana siguiente: con la
    // regla vieja quedaban cinco horas, de madrugada.
    const creado = new Date("2026-09-05T02:00:00.000Z"); // 19:00 del 4, Tijuana
    const manana = new Date("2026-09-05T16:00:00.000Z"); // 09:00 del 5, Tijuana
    const horas = (preRegExpiry(manana, "America/Tijuana", creado).getTime() - creado.getTime()) / 3_600_000;
    expect(horas).toBeGreaterThanOrEqual(MIN_HORAS_PREREGISTRO);
  });
});
