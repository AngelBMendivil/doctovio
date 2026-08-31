import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { cycleState, periodOf, periodDueDate } from "@/lib/services/platform-billing";

/**
 * Cobertura de los tests del encargo que NO necesitan base de datos:
 *
 *   TEST 12  una mensualidad vencida se identifica correctamente
 *   TEST 13  el cálculo de cartera vencida (la parte de días y estado)
 *
 * Los TEST 01-11 y 16 sí requieren base y quedan para validación en vivo.
 */
describe("cycleState — estado visible de una mensualidad", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T15:30:00"));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  const cycle = (status: "PENDING" | "PAID" | "PARTIAL" | "WAIVED", dueDate: string) => ({
    status,
    dueDate: new Date(`${dueDate}T12:00:00`),
  });

  it("pendiente con vencimiento futuro sigue pendiente", () => {
    expect(cycleState(cycle("PENDING", "2026-10-01"))).toEqual({ view: "PENDING", daysOverdue: 0 });
  });

  it("TEST 12 — pendiente con vencimiento pasado sale VENCIDO y cuenta los días", () => {
    const r = cycleState(cycle("PENDING", "2026-09-01"));
    expect(r.view).toBe("OVERDUE");
    expect(r.daysOverdue).toBe(14);
  });

  it("el día exacto del vencimiento TODAVÍA no está vencido", () => {
    // Se debe hasta el cierre del día. Marcarlo vencido esa mañana es cobrarle
    // a alguien que está en tiempo.
    const r = cycleState(cycle("PENDING", "2026-09-15"));
    expect(r.view).toBe("PENDING");
    expect(r.daysOverdue).toBe(0);
  });

  it("la hora del día no vence a nadie", () => {
    const temprano = cycleState(cycle("PENDING", "2026-09-15"), new Date("2026-09-15T00:01:00"));
    const tarde = cycleState(cycle("PENDING", "2026-09-15"), new Date("2026-09-15T23:59:00"));
    expect(temprano).toEqual(tarde);
  });

  it("pagado nunca se muestra vencido, por viejo que sea", () => {
    expect(cycleState(cycle("PAID", "2026-01-01"))).toEqual({ view: "PAID", daysOverdue: 0 });
  });

  it("condonado tampoco se muestra vencido", () => {
    expect(cycleState(cycle("WAIVED", "2026-01-01"))).toEqual({ view: "WAIVED", daysOverdue: 0 });
  });

  it("un parcial vencido se reporta como VENCIDO, no como parcial", () => {
    // Lo que importa para cobranza es que se pasó la fecha; que haya abonado
    // algo no lo pone al corriente.
    const r = cycleState(cycle("PARTIAL", "2026-08-01"));
    expect(r.view).toBe("OVERDUE");
    expect(r.daysOverdue).toBe(45);
  });

  it("un parcial todavía en tiempo se reporta como parcial", () => {
    expect(cycleState(cycle("PARTIAL", "2026-10-01")).view).toBe("PARTIAL");
  });
});

describe("periodos", () => {
  it("arma el periodo con el mes en dos dígitos", () => {
    expect(periodOf(new Date("2026-09-15T12:00:00"))).toBe("2026-09");
    expect(periodOf(new Date("2026-01-03T12:00:00"))).toBe("2026-01");
    expect(periodOf(new Date("2026-12-31T12:00:00"))).toBe("2026-12");
  });

  it("el vencimiento es el día 1 del periodo", () => {
    const d = periodDueDate("2026-09");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8); // 0 = enero
    expect(d.getDate()).toBe(1);
  });

  it("fija el mediodía para que la zona horaria no recorra el día", () => {
    // Es la misma trampa que ya nos mordió con scheduledDate: a medianoche
    // UTC, en México el día se recorre al anterior.
    expect(periodDueDate("2026-09").getHours()).toBe(12);
  });

  it("rechaza un periodo mal formado en vez de inventar una fecha", () => {
    expect(() => periodDueDate("septiembre")).toThrow();
    expect(() => periodDueDate("2026-13")).toThrow();
    expect(() => periodDueDate("2026-00")).toThrow();
  });

  it("ida y vuelta: el periodo de su propio vencimiento es él mismo", () => {
    expect(periodOf(periodDueDate("2026-09"))).toBe("2026-09");
    expect(periodOf(periodDueDate("2026-01"))).toBe("2026-01");
  });
});
