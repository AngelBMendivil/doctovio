import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { receiveMessage } from "@/lib/conversation/orchestrator";
import { checkVerifyToken, isValidSignature, isOurPhoneNumber } from "@/lib/whatsapp/config";

/**
 * WEBHOOK DE WHATSAPP — única puerta por la que entran los mensajes de Meta.
 *
 * Responsabilidades (en este orden):
 *   1. Verificar que el evento venga de Meta (firma HMAC con el App Secret).
 *   2. Responder rápido: Meta reintenta si tardamos, y eso duplica mensajes.
 *   3. Ignorar duplicados (el mismo id de mensaje puede llegar varias veces).
 *   4. Pasar el mensaje al orquestador.
 *   5. Registrar los estados de entrega.
 *
 * Nunca escribe datos clínicos en logs.
 *
 * Nota: la configuración y la validación viven en lib/whatsapp/config.ts.
 * Dentro de app/ el bundler deja `process.env` sin definir en la capa RSC.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — el saludo inicial. Meta llama esta URL con el verify token para
 * comprobar que el servidor es nuestro; hay que devolver el challenge tal cual.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (checkVerifyToken(mode, token)) {
    // Texto plano, sin comillas: Meta compara literal.
    return new NextResponse(challenge ?? "", { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

type IncomingMessage = {
  id: string;
  from: string;
  type: string;
  text?: { body: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
};

type WebhookBody = {
  entry?: {
    changes?: {
      value?: {
        metadata?: { phone_number_id?: string };
        messages?: IncomingMessage[];
        statuses?: { id: string; status: string; errors?: { title?: string }[] }[];
      };
    }[];
  }[];
};

/**
 * Saca el texto del mensaje, venga como texto libre o como botón/lista.
 * Se usa el título del botón (no su id) porque la máquina conversacional ya
 * sabe interpretar tanto el texto de la opción como su número.
 */
function extractText(m: IncomingMessage): string | null {
  if (m.type === "text") return m.text?.body ?? null;
  if (m.type === "interactive") {
    return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null;
  }
  return null;
}

export async function POST(request: Request) {
  // El cuerpo crudo es indispensable: la firma se calcula sobre los bytes
  // exactos, no sobre el JSON reserializado.
  const raw = await request.text();

  if (!isValidSignature(raw, request.headers.get("x-hub-signature-256"))) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true }); // basura: se descarta sin reintento
  }

  // A Meta se le responde 200 pase lo que pase: un error nuestro no debe
  // provocar que reintente y duplique el mensaje.
  try {
    await process_(body);
  } catch (e) {
    console.error("[whatsapp] error procesando webhook:", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ ok: true });
}

async function process_(body: WebhookBody) {
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;

      const phoneNumberId = value.metadata?.phone_number_id;
      if (!isOurPhoneNumber(phoneNumberId)) {
        console.warn("[whatsapp] evento para un numero no registrado:", phoneNumberId);
        continue;
      }

      const organizationId = await resolveOrganization();
      if (!organizationId) continue;

      // Mensajes entrantes del paciente.
      for (const msg of value.messages ?? []) {
        const text = extractText(msg);
        // Audio, imagen o ubicación: el asistente no los procesa, pero deja
        // constancia para que el consultorio vea que el paciente escribió.
        await receiveMessage(
          organizationId,
          msg.from,
          "WHATSAPP",
          text ?? "[mensaje no compatible]",
          msg.id
        );
      }

      // Acuses de entrega de lo que nosotros mandamos.
      for (const status of value.statuses ?? []) {
        await db.conversationMessage
          .updateMany({
            where: { externalId: status.id },
            data: {
              deliveryStatus: status.status,
              errorText: status.errors?.[0]?.title ?? null,
            },
          })
          .catch(() => undefined);
      }
    }
  }
}

/**
 * Por ahora hay un solo número para toda la instalación. Cuando Doctovio sea
 * multiconsultorio, el phone_number_id se buscará en una tabla de números
 * por organización.
 */
async function resolveOrganization(): Promise<string | null> {
  const org = await db.organization.findFirst({ where: { isActive: true }, select: { id: true } });
  return org?.id ?? null;
}
