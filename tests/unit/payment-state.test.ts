import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { paymentState } from "@/lib/services/clinics";

/**
 * Este cálculo decide qué ve el operador en el panel: quién está al corriente,
 * quién por vencer y quién vencido. A partir de eso decide a quién le habla y,
 * eventualmente, a quién suspende.
 *
 * Marcar vencido a alguien que sí pagó lleva a suspender un consultorio que
 * está al día. Por eso interesan sobre todo los límites: el día exacto del
 * vencimiento y la hora del día.
 */
describe("paymentState", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    // Media tarde, a propósito: la hora no debe influir en nada.
    vi.setSystemTime(new Date("2026-08-26T15:30:00"));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("sin fecha de pago devuelve SIN_REGISTRO", () => {
    expect(paymentState(null)).toEqual({ state: "SIN_REGISTRO", days: null });
  });

  it("con la fecha lejana está al corriente", () => {
    const r = paymentState(new Date("2026-12-31T00:00:00"));
    expect(r.state).toBe("AL_CORRIENTE");
    expect(r.days).toBeGreaterThan(7);
  });

  it("dentro de los 7 días avisa que está por vencer", () => {
    const r = paymentState(new Date("2026-08-30T00:00:00"));
    expect(r.state).toBe("POR_VENCER");
    expect(r.days).toBe(4);
  });

  it("el día exacto del vencimiento TODAVÍA está cubierto", () => {
    // Pagado "hasta el 26" significa que el 26 sigue cubierto. Marcarlo vencido
    // hoy le quitaría un día al que sí pagó.
    const r = paymentState(new Date("2026-08-26T00:00:00"));
    expect(r.state).toBe("POR_VENCER");
    expect(r.days).toBe(0);
  });

  it("la hora del día no cambia nada", () => {
    // A las 3:30 de la tarde, un vencimiento "hoy a las 00:00" no está vencido.
    // Sin normalizar a día, esta comparación daría VENCIDO desde la madrugada.
    const madrugada = paymentState(new Date("2026-08-26T00:00:00"));
    const nocheDelMismoDia = paymentState(new Date("2026-08-26T23:59:00"));
    expect(madrugada.state).toBe(nocheDelMismoDia.state);
    expect(madrugada.days).toBe(nocheDelMismoDia.days);
  });

  it("un día después ya está vencido, y dice desde cuándo", () => {
    const r = paymentState(new Date("2026-08-25T00:00:00"));
    expect(r.state).toBe("VENCIDO");
    expect(r.days).toBe(-1);
  });

  it("cuenta bien un vencimiento viejo", () => {
    const r = paymentState(new Date("2026-07-26T00:00:00"));
    expect(r.state).toBe("VENCIDO");
    expect(r.days).toBe(-31);
  });

  it("respeta un margen de aviso distinto", () => {
    // Con 30 días de aviso, algo a 20 días ya debe alertar.
    expect(paymentState(new Date("2026-09-15T00:00:00"), 30).state).toBe("POR_VENCER");
    expect(paymentState(new Date("2026-09-15T00:00:00"), 7).state).toBe("AL_CORRIENTE");
  });
});
