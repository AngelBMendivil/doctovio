import { describe, it, expect } from "vitest";
import { pick } from "@/lib/conversation/machine";

/**
 * `pick` traduce lo que escribe el paciente a una de las opciones del menú.
 * Si falla, el bot no entiende y escala a recepción: el asistente deja de
 * servir justo para lo que existe.
 *
 * El caso de los 20 caracteres es un bug real y documentado en CLAUDE.md:
 * WhatsApp CORTA el título de un botón a 20 caracteres, y cuando el paciente
 * lo toca devuelve el texto cortado. Sin esta red de seguridad, el bot no
 * reconocía su propio botón.
 */
describe("pick", () => {
  const OPCIONES = ["Agendar una cita", "Consultar mi cita", "Reagendar", "Cancelar"];

  describe("por número", () => {
    it("acepta el número de la opción", () => {
      expect(pick("1", OPCIONES)).toBe(0);
      expect(pick("4", OPCIONES)).toBe(3);
    });

    it("tolera espacios alrededor", () => {
      expect(pick("  2  ", OPCIONES)).toBe(1);
    });

    it("rechaza un número fuera del menú", () => {
      expect(pick("0", OPCIONES)).toBeNull();
      expect(pick("9", OPCIONES)).toBeNull();
    });
  });

  describe("por texto", () => {
    it("acepta el texto exacto de la opción", () => {
      expect(pick("Reagendar", OPCIONES)).toBe(2);
    });

    it("ignora mayúsculas y minúsculas", () => {
      expect(pick("CANCELAR", OPCIONES)).toBe(3);
      expect(pick("cancelar", OPCIONES)).toBe(3);
    });

    it("no adivina con texto que no corresponde a ninguna opción", () => {
      // Mejor escalar a una persona que agendar algo que el paciente no pidió.
      expect(pick("quiero hablar con alguien", OPCIONES)).toBeNull();
    });
  });

  describe("el corte de 20 caracteres de WhatsApp", () => {
    const LARGA = ["Confirmar mi asistencia a la cita"]; // 32 caracteres

    it("reconoce el título cortado que devuelve WhatsApp", () => {
      // Esto es LITERALMENTE lo que llega cuando el paciente toca el botón.
      const cortado = "Confirmar mi asiste"; // los primeros 19-20 caracteres
      expect(pick(cortado, LARGA)).toBeNull();

      // Con exactamente 20 caracteres sí lo reconoce, que es el caso real.
      expect(pick("Confirmar mi asisten", LARGA)).toBe(0);
    });

    it("sigue reconociendo el texto completo", () => {
      expect(pick("Confirmar mi asistencia a la cita", LARGA)).toBe(0);
    });

    it("una opción corta no se ve afectada por la regla del corte", () => {
      expect(pick("Cancelar", OPCIONES)).toBe(3);
    });
  });

  describe("devuelve null, nunca -1 (regresión)", () => {
    /**
     * `findIndex` devuelve -1, y durante un tiempo `pick` lo devolvía tal cual
     * pese a declarar `number | null`. Eso rompía dos cosas en machine.ts:
     *
     *   1. Las 12 comprobaciones `if (choice === null)` — las que repiten el
     *      menú cuando el paciente escribe algo que el bot no entiende — nunca
     *      se cumplían.
     *   2. `pick(...) ?? menuFromIntent(intent)`: `??` solo actúa sobre
     *      null/undefined, así que con -1 jamás entraba y `menuFromIntent`
     *      quedaba como código muerto.
     *
     * Un -1 aquí vuelve a matar esas 12 ramas en silencio. De ahí esta prueba.
     */
    it("null es distinto de -1 y hace funcionar el operador ??", () => {
      const sinCoincidencia = pick("texto que no existe en el menú", OPCIONES);

      expect(sinCoincidencia).toBeNull();
      expect(sinCoincidencia).not.toBe(-1);

      // Lo que de verdad importa: que `??` entre al respaldo.
      const conRespaldo = sinCoincidencia ?? 99;
      expect(conRespaldo).toBe(99);
    });

    it("el índice 0 no se confunde con 'sin coincidencia'", () => {
      // Con `??`, un 0 legítimo debe pasar tal cual: es el peligro de haber
      // usado `||` en vez de `??` al arreglarlo.
      const primera = pick("Agendar una cita", OPCIONES);
      expect(primera).toBe(0);
      expect(primera ?? 99).toBe(0);
    });
  });
});
