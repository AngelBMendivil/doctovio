import { describe, it, expect } from "vitest";
import { calculateBMI } from "@/lib/utils/bmi";

/**
 * El IMC se guarda en los signos vitales y aparece en el expediente. Un error
 * aquí no truena nada: solo deja un número clínico equivocado, que es peor,
 * porque nadie lo nota.
 *
 * Interesa sobre todo qué hace con datos incompletos. En la consulta es normal
 * capturar el peso y todavía no la talla, y en ese momento la respuesta
 * correcta es "no se puede calcular", nunca un cero que se lea como un IMC real.
 */
describe("calculateBMI", () => {
  it("calcula el IMC y lo redondea a un decimal", () => {
    // 70 kg / (1.75 m)^2 = 22.857… → 22.9
    expect(calculateBMI(70, 175)).toBe(22.9);
  });

  it("redondea hacia arriba cuando corresponde", () => {
    // 80 / (1.8)^2 = 24.691… → 24.7
    expect(calculateBMI(80, 180)).toBe(24.7);
  });

  it("devuelve null si falta la talla", () => {
    expect(calculateBMI(70, null)).toBeNull();
    expect(calculateBMI(70, undefined)).toBeNull();
  });

  it("devuelve null si falta el peso", () => {
    expect(calculateBMI(null, 175)).toBeNull();
    expect(calculateBMI(undefined, 175)).toBeNull();
  });

  it("devuelve null con talla cero en vez de dividir entre cero", () => {
    // Sin esta guarda daría Infinity, y un IMC de Infinity se guardaría igual.
    expect(calculateBMI(70, 0)).toBeNull();
  });

  it("devuelve null con valores negativos", () => {
    expect(calculateBMI(70, -175)).toBeNull();
  });

  it("no confunde un peso de 0 con un dato faltante: ambos dan null", () => {
    // 0 kg no es un peso válido; que caiga en el mismo camino está bien.
    expect(calculateBMI(0, 175)).toBeNull();
  });
});
