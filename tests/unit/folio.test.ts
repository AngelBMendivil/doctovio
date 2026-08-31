import { describe, it, expect } from "vitest";
import { formatConsecutivo, parseFolio } from "@/lib/utils/folio";

/**
 * Matriz de validación: SCH-01 (doble clic al agendar), CLN-03/ORD-01
 * (emisión de receta y orden).
 *
 * El folio es lo que el paciente dicta por teléfono y lo que identifica una
 * receta ante una farmacia. Dos documentos con el mismo folio, o un folio que
 * el asistente no reconoce, son problemas reales.
 *
 * La parte de concurrencia (el candado `FOR UPDATE`) no se puede probar sin
 * base de datos y queda como BLOCKED en el reporte.
 */
describe("formatConsecutivo", () => {
  it("rellena a 6 dígitos", () => {
    expect(formatConsecutivo(1)).toBe("000001");
    expect(formatConsecutivo(123)).toBe("000123");
  });

  it("no trunca cuando se pasa de 6 dígitos", () => {
    // Preferible un folio largo que uno cortado, que colisionaría con otro.
    expect(formatConsecutivo(1234567)).toBe("1234567");
  });
});

describe("parseFolio — el paciente dicta su folio por WhatsApp", () => {
  it("reconoce el folio de una cita", () => {
    expect(parseFolio("DOC-000123")).toEqual({ prefix: "DOC", year: null, consecutivo: 123 });
  });

  it("reconoce receta y orden, con su año", () => {
    expect(parseFolio("RX-2026-000045")).toEqual({ prefix: "RX", year: 2026, consecutivo: 45 });
    expect(parseFolio("OM-2026-000045")).toEqual({ prefix: "OM", year: 2026, consecutivo: 45 });
  });

  it("tolera minúsculas y espacios", () => {
    // Nadie escribe el folio perfecto en WhatsApp.
    expect(parseFolio("doc-000123")?.consecutivo).toBe(123);
    expect(parseFolio("  DOC-000123  ")?.consecutivo).toBe(123);
    expect(parseFolio("DOC - 000123")?.consecutivo).toBe(123);
  });

  it("rechaza lo que no es un folio, en vez de adivinar", () => {
    expect(parseFolio("000123")).toBeNull();
    expect(parseFolio("XX-2026-000001")).toBeNull();
    expect(parseFolio("")).toBeNull();
    expect(parseFolio("hola")).toBeNull();
  });

  it("no acepta una cita con año ni una receta sin año", () => {
    // Los formatos son distintos a propósito: DOC no lleva año.
    expect(parseFolio("DOC-2026-000123")).toBeNull();
    expect(parseFolio("RX-000123")).toBeNull();
  });
});
