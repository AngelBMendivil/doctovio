import { randomBytes } from "crypto";

/** Genera un token opaco y seguro para enlaces públicos (prerregistro, referencias). */
export function generateSecureToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
