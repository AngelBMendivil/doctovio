import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

/**
 * Cifrado simétrico para secretos que la app debe poder volver a leer
 * (a diferencia de una contraseña, que se hashea y nunca se recupera).
 *
 * Caso de uso: el refresh token de Google Calendar. Da acceso permanente a la
 * agenda personal del médico, así que no puede quedar en texto plano en la
 * base: quien lea un respaldo, tendría su calendario.
 *
 * AES-256-GCM con clave derivada de AUTH_SECRET. GCM además autentica: si
 * alguien altera el texto cifrado, el descifrado falla en vez de devolver
 * basura silenciosamente.
 *
 * Límite honesto: la clave vive en el .env, junto a los datos. Protege contra
 * fuga de respaldos o de la base, NO contra alguien que ya tenga el servidor.
 * Para eso haría falta un gestor de secretos (KMS), que es otra conversación.
 */

const ALGO = "aes-256-gcm";

function key(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Falta AUTH_SECRET: no se pueden cifrar secretos.");
  // El salt fijo es aceptable aquí: la entropía la aporta AUTH_SECRET.
  return scryptSync(secret, "doctovio-secret-box", 32);
}

/** Devuelve iv:tag:ciphertext en base64, todo en una cadena. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Secreto con formato inválido.");

  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}
