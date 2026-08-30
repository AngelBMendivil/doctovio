import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { calculateAge } from "@/lib/utils/age";

/**
 * La edad no es un dato cosmético: se imprime en la receta y orienta la dosis.
 * Equivocarla por un año importa de verdad en pediatría y en geriatría.
 *
 * El tiempo se congela porque `calculateAge` compara contra `new Date()`. Sin
 * congelarlo, estas pruebas empezarían a fallar solas al pasar los años, que es
 * la peor clase de prueba: la que falla sin que nadie haya roto nada.
 */
describe("calculateAge", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T12:00:00Z"));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("cuenta los años cumplidos", () => {
    expect(calculateAge(new Date("1990-01-15T00:00:00Z"))).toBe(36);
  });

  it("NO cuenta el año en curso si el cumpleaños todavía no llega", () => {
    // Cumple en diciembre; hoy es agosto. Tiene 35, no 36.
    // Este es el error clásico de restar años a secas.
    expect(calculateAge(new Date("1990-12-25T00:00:00Z"))).toBe(35);
  });

  it("cuenta el año el mismo día del cumpleaños", () => {
    expect(calculateAge(new Date("2000-08-26T00:00:00Z"))).toBe(26);
  });

  it("devuelve 0 para un bebé de meses, no un número negativo", () => {
    expect(calculateAge(new Date("2026-03-01T00:00:00Z"))).toBe(0);
  });

  it("acepta la fecha como cadena", () => {
    expect(calculateAge("1990-01-15")).toBe(36);
  });
});
