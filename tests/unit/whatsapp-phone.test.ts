import { describe, it, expect } from "vitest";
import { toWaId } from "@/lib/whatsapp/client";

/**
 * `toWaId` decide A QUÉ NÚMERO sale un mensaje. Equivocarse aquí no es un
 * error de formato: es mandarle a un desconocido el recordatorio de la cita de
 * otra persona, con su nombre y la hora.
 *
 * La regla delicada: la lada por default se agrega SOLO a números locales de
 * 10 dígitos, que es lo que el personal captura a mano. Un número que ya trae
 * lada —como el `wa_id` que llega en el webhook— se deja intacto. Si se le
 * agregara lada a un número que ya la tiene, quedaría 5252...
 */
describe("toWaId", () => {
  it("agrega la lada de México a un número local de 10 dígitos", () => {
    expect(toWaId("6646486605")).toBe("526646486605");
  });

  it("deja intacto un número que ya trae lada", () => {
    // Es lo que llega del webhook de WhatsApp como wa_id.
    expect(toWaId("526646486605")).toBe("526646486605");
  });

  it("quita separadores de lo que se captura a mano", () => {
    expect(toWaId("(664) 648-6605")).toBe("526646486605");
    expect(toWaId("664 648 66 05")).toBe("526646486605");
    expect(toWaId("+52 664 648 6605")).toBe("526646486605");
  });

  it("respeta otra lada cuando se le indica", () => {
    expect(toWaId("2125551234", "1")).toBe("12125551234");
  });

  it("no inventa lada para números que no son de 10 dígitos", () => {
    // Un número corto va mal de origen; agregarle lada solo esconde el problema.
    expect(toWaId("12345")).toBe("12345");
  });

  it("devuelve cadena vacía si no hay dígitos", () => {
    expect(toWaId("sin numero")).toBe("");
  });
});
