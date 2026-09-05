import { describe, it, expect } from "vitest";
import { round2, lineTotal, formatMoney } from "@/lib/utils/money";
import {
  mesialSide,
  toothName,
  isMissingCode,
  LAYERS,
  CATEGORIAS_SUGERIDAS,
} from "@/lib/constants/odontograma";
import { planTotals, itemTotal } from "@/lib/services/treatment-plan";
import { isExpired, quoteStateLabel } from "@/lib/services/quotes";
import { parseFolio } from "@/lib/utils/folio";
import type { TreatmentStatus } from "@prisma/client";

/**
 * MÓDULO DENTAL — lógica pura.
 *
 * Lo que se prueba aquí es lo que no se ve fallar: un lado espejeado del
 * diagrama, un centavo que se pierde renglón a renglón, una cotización aceptada
 * que da por hecho un tratamiento que nadie hizo.
 */

describe("dinero", () => {
  it("redondea a centavos en cada paso, no solo al final", () => {
    // El caso clásico de coma flotante. Sin redondear, 0.1+0.2 = 0.30000000000000004
    // y ese error se acumula renglón a renglón hasta que el total impreso no
    // cuadra con la suma de la hoja.
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(850.555)).toBe(850.56);
    expect(round2(1 / 3)).toBe(0.33);
  });

  it("el importe de un renglón descuenta después de multiplicar", () => {
    expect(lineTotal(850, 2, 200)).toBe(1500);
    expect(lineTotal(850, 1)).toBe(850);
  });

  it("un descuento mayor que el importe deja el renglón en cero, no en negativo", () => {
    // Un renglón negativo sería una nota de crédito escondida dentro de una
    // cotización, y nadie la vería venir.
    expect(lineTotal(500, 1, 900)).toBe(0);
  });

  it("formatea en pesos mexicanos", () => {
    expect(formatMoney(4200)).toContain("4,200");
  });
});

describe("orientación del diagrama", () => {
  /**
   * El error que este bloque existe para impedir: marcar la caries en la cara
   * contraria del diente. Mesial es "hacia la línea media", así que en los
   * cuadrantes que se dibujan a la izquierda de la pantalla queda a la derecha
   * del cuadrito, y al revés en los de la derecha.
   */
  it("en el lado derecho del paciente, mesial va a la derecha del dibujo", () => {
    ["11", "18", "41", "48"].forEach((c) => expect(mesialSide(c)).toBe("right"));
  });

  it("en el lado izquierdo del paciente, mesial va a la izquierda", () => {
    ["21", "28", "31", "38"].forEach((c) => expect(mesialSide(c)).toBe("left"));
  });

  it("los temporales siguen la misma regla", () => {
    expect(mesialSide("55")).toBe("right"); // cuadrante 5: superior derecho
    expect(mesialSide("65")).toBe("left"); // cuadrante 6: superior izquierdo
    expect(mesialSide("85")).toBe("right"); // cuadrante 8: inferior derecho
    expect(mesialSide("75")).toBe("left"); // cuadrante 7: inferior izquierdo
  });
});

describe("nombre de la pieza", () => {
  it("dice arriba/abajo y el lado DEL PACIENTE", () => {
    expect(toothName("16")).toBe("Primer molar superior derecho");
    expect(toothName("26")).toBe("Primer molar superior izquierdo");
    expect(toothName("31")).toBe("Incisivo central inferior izquierdo");
    expect(toothName("48")).toBe("Tercer molar inferior derecho");
  });

  it("los temporales se nombran como tales", () => {
    // El 55 es el segundo molar temporal, no el quinto de nada.
    expect(toothName("55")).toBe("Segundo molar superior derecho temporal");
    expect(toothName("71")).toBe("Incisivo central inferior izquierdo temporal");
  });

  it("un código inválido se devuelve tal cual en vez de romper la pantalla", () => {
    expect(toothName("99")).toBe("99");
  });
});

describe("capas del diagrama", () => {
  it("cada capa tiene color Y letra", () => {
    // El color solo no basta: alrededor de uno de cada doce hombres no
    // distingue el rojo del verde, y este diagrama se lee justo por ahí.
    for (const l of Object.values(LAYERS)) {
      expect(l.color).toMatch(/^#[0-9A-F]{6}$/i);
      expect(l.letra.length).toBeGreaterThan(0);
      expect(l.label.length).toBeGreaterThan(0);
    }
  });

  it("las piezas que ya no están en la boca se marcan como ausentes", () => {
    expect(isMissingCode("AUSENTE")).toBe(true);
    expect(isMissingCode("EXTRACCION")).toBe(true);
    expect(isMissingCode("NO_ERUPCIONADO")).toBe(true);
    // Una corona o una endodoncia NO dejan la pieza fuera: sigue ahí.
    expect(isMissingCode("CORONA")).toBe(false);
    expect(isMissingCode("ENDODONCIA")).toBe(false);
  });
});

describe("totales del plan de tratamiento", () => {
  const item = (unitPrice: number, quantity = 1, discount = 0, status: TreatmentStatus = "PENDING") => ({
    unitPrice,
    quantity,
    discount,
    status,
  });

  it("suma lo vivo", () => {
    const t = planTotals([item(850), item(850), item(2500)]);
    expect(t.subtotal).toBe(4200);
    expect(t.total).toBe(4200);
    expect(t.pendientes).toBe(3);
  });

  it("lo cancelado NO se le cobra a nadie", () => {
    const t = planTotals([item(850), item(2500, 1, 0, "CANCELLED")]);
    expect(t.subtotal).toBe(850);
    expect(t.total).toBe(850);
  });

  it("los descuentos bajan el total", () => {
    const t = planTotals([item(1000, 1, 150)]);
    expect(t.subtotal).toBe(1000);
    expect(t.discount).toBe(150);
    expect(t.total).toBe(850);
  });

  it("cuenta por separado lo aceptado y lo realizado", () => {
    const t = planTotals([
      item(100, 1, 0, "PENDING"),
      item(100, 1, 0, "ACCEPTED"),
      item(100, 1, 0, "COMPLETED"),
    ]);
    expect(t.pendientes).toBe(1);
    expect(t.aceptados).toBe(1);
    expect(t.realizados).toBe(1);
  });

  it("el importe por renglón multiplica antes de descontar", () => {
    expect(itemTotal({ unitPrice: 850, quantity: 2, discount: 100 })).toBe(1600);
  });
});

describe("vigencia de la cotización", () => {
  const ayer = new Date(Date.now() - 86_400_000);
  const manana = new Date(Date.now() + 86_400_000);

  it("sin fecha límite no vence nunca", () => {
    expect(isExpired({ validUntil: null, status: "SENT" })).toBe(false);
  });

  it("una enviada con fecha pasada está vencida", () => {
    expect(isExpired({ validUntil: ayer, status: "SENT" })).toBe(true);
    expect(quoteStateLabel({ validUntil: ayer, status: "SENT" })).toBe("Vencida");
  });

  it("una ya decidida no vence: su historia terminó antes", () => {
    // Una cotización aceptada en marzo no se convierte en "vencida" en abril.
    // Lo que venció es la oferta, y esa ya se tomó.
    expect(isExpired({ validUntil: ayer, status: "ACCEPTED" })).toBe(false);
    expect(isExpired({ validUntil: ayer, status: "REJECTED" })).toBe(false);
    expect(isExpired({ validUntil: ayer, status: "CANCELLED" })).toBe(false);
    expect(quoteStateLabel({ validUntil: ayer, status: "ACCEPTED" })).toBe("Aceptada");
  });

  it("dentro de la vigencia sigue viva", () => {
    expect(isExpired({ validUntil: manana, status: "SENT" })).toBe(false);
    expect(quoteStateLabel({ validUntil: manana, status: "SENT" })).toBe("Enviada");
  });
});

describe("folio de cotización", () => {
  it("se reconoce COT-000145 sin año, como las citas", () => {
    expect(parseFolio("COT-000145")).toEqual({ prefix: "COT", year: null, consecutivo: 145 });
  });

  it("se reconoce aunque venga en minúsculas o con espacios", () => {
    expect(parseFolio(" cot-000145 ")?.consecutivo).toBe(145);
  });

  it("los folios con año siguen funcionando igual", () => {
    expect(parseFolio("RX-2026-000123")).toEqual({ prefix: "RX", year: 2026, consecutivo: 123 });
    expect(parseFolio("DOC-000123")).toEqual({ prefix: "DOC", year: null, consecutivo: 123 });
  });
});

describe("categorías sugeridas", () => {
  it("no se repiten", () => {
    expect(new Set(CATEGORIAS_SUGERIDAS).size).toBe(CATEGORIAS_SUGERIDAS.length);
  });
});
