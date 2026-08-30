import { describe, it, expect, beforeAll } from "vitest";
import { encryptSecret, decryptSecret } from "@/lib/utils/crypto";

/**
 * Lo que se cifra aquí es el refresh token de Google Calendar: da acceso
 * permanente a la agenda personal del médico. Si el cifrado se rompe en
 * silencio —o peor, si deja de cifrar y nadie lo nota— ese token queda legible
 * para quien lea un respaldo de la base.
 *
 * La prueba que más importa es la de manipulación: AES-GCM autentica, así que
 * un texto cifrado alterado debe FALLAR, no devolver basura que la app trate
 * como un token válido.
 */
describe("cifrado de secretos", () => {
  beforeAll(() => {
    // key() lee AUTH_SECRET al llamarse, no al cargar el módulo.
    process.env.AUTH_SECRET = "secreto-de-pruebas-no-usar-en-produccion";
  });

  it("descifra de vuelta lo que cifró", () => {
    const original = "1//0abcXYZ-refresh-token-de-google";
    expect(decryptSecret(encryptSecret(original))).toBe(original);
  });

  it("cifra dos veces el mismo texto y da resultados distintos", () => {
    // El IV es aleatorio en cada cifrado. Si dos cifrados del mismo texto
    // dieran lo mismo, se podría deducir qué médicos comparten un valor.
    const a = encryptSecret("mismo-token");
    const b = encryptSecret("mismo-token");
    expect(a).not.toBe(b);
    // Pero ambos descifran al mismo original.
    expect(decryptSecret(a)).toBe(decryptSecret(b));
  });

  it("FALLA si alguien altera el texto cifrado", () => {
    const payload = encryptSecret("token-original");
    const [iv, tag, data] = payload.split(":");

    // Se cambia un byte del texto cifrado.
    const alterado = Buffer.from(data, "base64");
    alterado[0] = alterado[0] ^ 0xff;

    expect(() => decryptSecret([iv, tag, alterado.toString("base64")].join(":"))).toThrow();
  });

  it("FALLA si alguien altera la etiqueta de autenticación", () => {
    const payload = encryptSecret("token-original");
    const [iv, , data] = payload.split(":");
    const tagFalso = Buffer.alloc(16).toString("base64");

    expect(() => decryptSecret([iv, tagFalso, data].join(":"))).toThrow();
  });

  it("rechaza un formato inválido en vez de devolver basura", () => {
    expect(() => decryptSecret("esto-no-es-un-secreto")).toThrow("Secreto con formato inválido.");
    expect(() => decryptSecret("solo:dos")).toThrow("Secreto con formato inválido.");
    expect(() => decryptSecret("")).toThrow("Secreto con formato inválido.");
  });

  it("soporta acentos y caracteres no ASCII", () => {
    const original = "contraseña con ñ y acentos áéíóú";
    expect(decryptSecret(encryptSecret(original))).toBe(original);
  });
});
