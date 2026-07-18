import { createHmac, timingSafeEqual } from "crypto";

/**
 * Configuración y seguridad de WhatsApp.
 *
 * Las variables se leen AQUÍ, en un módulo de librería, y no dentro del route
 * handler: en app/ el bundler de Next deja `process.env` sin definir en la capa
 * RSC y revienta al cargar el módulo. Desde lib/ se leen sin problema.
 */
export const WHATSAPP_CONFIG = {
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
  wabaId: process.env.WHATSAPP_WABA_ID ?? "",
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? "",
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? "",
  appSecret: process.env.WHATSAPP_APP_SECRET ?? "",
  apiVersion: process.env.WHATSAPP_API_VERSION || "v21.0",
};

/** Responde el handshake de Meta: devuelve el challenge solo si el token coincide. */
export function checkVerifyToken(mode: string | null, token: string | null): boolean {
  const expected = WHATSAPP_CONFIG.verifyToken;
  return mode === "subscribe" && Boolean(expected) && token === expected;
}

/**
 * Valida la firma HMAC del webhook. Sin App Secret configurado devuelve false:
 * ante la duda se rechaza, nunca se confía.
 */
export function isValidSignature(rawBody: string, header: string | null): boolean {
  const secret = WHATSAPP_CONFIG.appSecret;
  if (!secret || secret === "PENDIENTE") return false;
  if (!header?.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const received = header.slice("sha256=".length);

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(received, "hex");
  if (a.length !== b.length) return false;

  // Comparación en tiempo constante: no filtra información por temporización.
  return timingSafeEqual(a, b);
}

/** El evento debe venir dirigido a NUESTRO número, no a otro de la misma app. */
export function isOurPhoneNumber(phoneNumberId?: string): boolean {
  return Boolean(phoneNumberId) && phoneNumberId === WHATSAPP_CONFIG.phoneNumberId;
}
