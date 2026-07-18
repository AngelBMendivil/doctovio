/**
 * Cliente de WhatsApp Cloud API.
 *
 * Única capa que habla con Meta. El resto de la app no sabe nada de esta API:
 * el orquestador solo pide "manda este texto con estas opciones".
 *
 * Variables de entorno necesarias (.env):
 *   WHATSAPP_PHONE_NUMBER_ID   id del número emisor (pantalla API Setup)
 *   WHATSAPP_ACCESS_TOKEN      token de acceso (temporal para probar, luego permanente)
 *   WHATSAPP_VERIFY_TOKEN      cadena inventada por nosotros para el handshake del webhook
 *   WHATSAPP_APP_SECRET        para validar la firma de los webhooks
 *   WHATSAPP_API_VERSION       opcional, por defecto v21.0
 */

import { WHATSAPP_CONFIG } from "./config";

const { apiVersion: API_VERSION, phoneNumberId: PHONE_NUMBER_ID, accessToken: ACCESS_TOKEN } = WHATSAPP_CONFIG;

/** Si falta configuración, la app sigue viva y el canal simplemente no está disponible. */
export function isWhatsAppConfigured(): boolean {
  return Boolean(PHONE_NUMBER_ID && ACCESS_TOKEN);
}

export class WhatsAppError extends Error {
  constructor(
    message: string,
    public status: number,
    /** true si vale la pena reintentar (red, cuota, 5xx). */
    public retryable: boolean
  ) {
    super(message);
    this.name = "WhatsAppError";
  }
}

/**
 * Identificador que espera Meta: dígitos con lada internacional.
 *
 * Si el número ya viene con lada (como el `wa_id` de un webhook) se usa tal
 * cual. La lada por default SOLO se agrega a números locales de 10 dígitos,
 * que es lo que captura el personal del consultorio a mano.
 */
export function toWaId(phone: string, defaultCountry = "52"): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `${defaultCountry}${digits}`;
  return digits;
}

async function post(body: unknown): Promise<{ externalId: string }> {
  if (!isWhatsAppConfigured()) {
    throw new WhatsAppError("WhatsApp no está configurado en este entorno.", 0, false);
  }

  const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", ...(body as object) }),
  });

  const json = (await res.json().catch(() => ({}))) as {
    messages?: { id: string }[];
    error?: { message?: string; code?: number };
  };

  if (!res.ok) {
    // 4xx = error nuestro (token, formato, ventana de 24h): no sirve reintentar.
    // 429 y 5xx = temporal: el reintento con espera sí ayuda.
    const retryable = res.status === 429 || res.status >= 500;
    throw new WhatsAppError(json.error?.message || `Error ${res.status} de WhatsApp`, res.status, retryable);
  }

  return { externalId: json.messages?.[0]?.id ?? "" };
}

/** Mensaje de texto simple. */
export async function sendText(to: string, body: string) {
  return post({
    to: toWaId(to),
    type: "text",
    text: { preview_url: false, body: body.slice(0, 4096) },
  });
}

/**
 * Mensaje con opciones. WhatsApp tiene dos formatos y límites distintos:
 *   hasta 3 opciones → botones
 *   4 a 10 opciones  → lista desplegable
 * Arriba de 10 no hay formato interactivo: se manda numerado como texto.
 */
export async function sendOptions(to: string, body: string, options: string[]) {
  const waId = toWaId(to);

  if (options.length === 0) return sendText(to, body);

  if (options.length > 10) {
    const numbered = options.map((o, i) => `${i + 1}. ${o}`).join("\n");
    return sendText(to, `${body}\n\n${numbered}`);
  }

  if (options.length <= 3) {
    return post({
      to: waId,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body.slice(0, 1024) },
        action: {
          buttons: options.map((o, i) => ({
            type: "reply",
            // El título del botón no admite más de 20 caracteres.
            reply: { id: `opt_${i + 1}`, title: o.slice(0, 20) },
          })),
        },
      },
    });
  }

  return post({
    to: waId,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: body.slice(0, 1024) },
      action: {
        button: "Ver opciones",
        sections: [
          {
            title: "Opciones",
            rows: options.map((o, i) => ({
              id: `opt_${i + 1}`,
              title: o.slice(0, 24),
            })),
          },
        ],
      },
    },
  });
}

/**
 * Plantilla aprobada. Obligatoria para iniciar conversación fuera de la
 * ventana de 24 horas (recordatorios, avisos). Se usará en la etapa 3.
 */
export async function sendTemplate(to: string, templateName: string, languageCode: string, params: string[] = []) {
  return post({
    to: toWaId(to),
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components: params.length
        ? [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }]
        : undefined,
    },
  });
}
