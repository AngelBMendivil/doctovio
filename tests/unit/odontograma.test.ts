import { describe, it, expect } from "vitest";
import {
  QUADRANTS,
  allTeeth,
  isValidTooth,
  dentitionOf,
  isUpper,
  isAnterior,
  surfaceLabel,
  codeLabel,
  isWholeToothCode,
} from "@/lib/constants/odontograma";

/**
 * Numeración FDI del odontograma.
 *
 * Un error aquí no es cosmético: significa registrar un tratamiento en el
 * diente equivocado, o en el lado equivocado de la boca. Y queda escrito en la
 * historia clínica del paciente.
 *
 * El error clásico es invertir los cuadrantes. El 1 es la DERECHA del paciente,
 * que en pantalla se dibuja a la izquierda, como si lo tuvieras enfrente.
 */
describe("cuadrantes FDI", () => {
  it("la dentición permanente tiene 32 piezas", () => {
    expect(allTeeth("PERMANENT")).toHaveLength(32);
  });

  it("la temporal tiene 20", () => {
    expect(allTeeth("DECIDUOUS")).toHaveLength(20);
  });

  it("no repite ninguna pieza", () => {
    const p = allTeeth("PERMANENT");
    expect(new Set(p).size).toBe(p.length);
  });

  it("el cuadrante 1 es arriba a la DERECHA del paciente", () => {
    // Se dibuja a la izquierda de la pantalla. Invertirlo manda el tratamiento
    // al lado contrario de la boca.
    expect(QUADRANTS.PERMANENT.upperRight).toContain(11);
    expect(QUADRANTS.PERMANENT.upperRight).toContain(18);
    expect(QUADRANTS.PERMANENT.upperLeft).toContain(21);
  });

  it("cada cuadrante permanente va del 1 al 8", () => {
    const piezas = (q: readonly number[]) => q.map((n) => Number(String(n)[1])).sort();
    expect(piezas(QUADRANTS.PERMANENT.upperRight)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(piezas(QUADRANTS.PERMANENT.lowerLeft)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("los temporales van del 1 al 5, en cuadrantes 5 a 8", () => {
    const t = allTeeth("DECIDUOUS");
    expect(t.every((c) => ["5", "6", "7", "8"].includes(c[0]))).toBe(true);
    expect(t.every((c) => Number(c[1]) >= 1 && Number(c[1]) <= 5)).toBe(true);
  });

  it("los cuadrantes se dibujan desde el fondo hacia la línea media", () => {
    // 18 es el tercer molar (la muela del juicio) y va primero; 11 es el
    // incisivo central y queda pegado a la línea media.
    expect(QUADRANTS.PERMANENT.upperRight[0]).toBe(18);
    expect(QUADRANTS.PERMANENT.upperRight.at(-1)).toBe(11);
  });
});

describe("isValidTooth", () => {
  it("acepta piezas reales", () => {
    ["11", "18", "28", "38", "48", "51", "85"].forEach((c) => expect(isValidTooth(c)).toBe(true));
  });

  it("rechaza códigos que no existen en la boca", () => {
    // 19 no existe: el cuadrante 1 llega al 8. El 9 tampoco es cuadrante.
    ["19", "10", "91", "00", "1", "111", ""].forEach((c) => expect(isValidTooth(c)).toBe(false));
  });

  it("un temporal no se confunde con un permanente", () => {
    expect(dentitionOf("51")).toBe("DECIDUOUS");
    expect(dentitionOf("11")).toBe("PERMANENT");
    expect(dentitionOf("99")).toBeNull();
  });
});

describe("arriba/abajo y adelante/atrás", () => {
  it("los cuadrantes 1, 2, 5 y 6 son superiores", () => {
    ["11", "28", "55", "65"].forEach((c) => expect(isUpper(c)).toBe(true));
    ["31", "48", "75", "85"].forEach((c) => expect(isUpper(c)).toBe(false));
  });

  it("incisivos y caninos son anteriores; premolares y molares no", () => {
    ["11", "12", "13", "43"].forEach((c) => expect(isAnterior(c)).toBe(true));
    ["14", "16", "18", "46"].forEach((c) => expect(isAnterior(c)).toBe(false));
  });
});

describe("surfaceLabel — el nombre cambia según la pieza", () => {
  it("la cara masticatoria es oclusal atrás e incisal adelante", () => {
    // Es la misma superficie anatómica con dos nombres. Llamarla mal en la
    // historia clínica confunde a quien la lea después.
    expect(surfaceLabel("OCCLUSAL_INCISAL", "16")).toBe("Oclusal");
    expect(surfaceLabel("OCCLUSAL_INCISAL", "11")).toBe("Incisal");
  });

  it("la cara interna es palatina arriba y lingual abajo", () => {
    expect(surfaceLabel("PALATAL_LINGUAL", "16")).toBe("Palatina");
    expect(surfaceLabel("PALATAL_LINGUAL", "46")).toBe("Lingual");
  });

  it("las que no cambian de nombre se mantienen", () => {
    expect(surfaceLabel("MESIAL", "16")).toBe("Mesial");
    expect(surfaceLabel("MESIAL", "41")).toBe("Mesial");
    expect(surfaceLabel("VESTIBULAR", "11")).toBe("Vestibular");
  });
});

describe("catálogo", () => {
  it("traduce los códigos a algo legible", () => {
    expect(codeLabel("CARIES")).toBe("Caries");
    expect(codeLabel("ENDODONCIA")).toBe("Endodoncia");
  });

  it("un código desconocido se devuelve tal cual en vez de romper", () => {
    expect(codeLabel("INVENTADO")).toBe("INVENTADO");
  });

  it("distingue lo que aplica al diente entero", () => {
    // Una extracción no tiene superficie: se va la pieza completa.
    expect(isWholeToothCode("EXTRACCION")).toBe(true);
    expect(isWholeToothCode("AUSENTE")).toBe(true);
    // Una caries sí: importa en cuál cara está.
    expect(isWholeToothCode("CARIES")).toBe(false);
    expect(isWholeToothCode("RESINA")).toBe(false);
  });
});
