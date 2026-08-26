import { db } from "@/lib/db";
import { WHATSAPP_CONFIG } from "./config";

/**
 * ENRUTAMIENTO MULTI-CONSULTORIO DE WHATSAPP.
 *
 * Un webhook entrante trae un `phone_number_id` (Meta) o un `instance id`
 * (Green API). De ahí, y SOLO de ahí, sale el consultorio dueño del mensaje.
 *
 * El orden importa y no es negociable:
 *
 *     instanceId → organizationId → (organizationId + phone) → paciente
 *
 * Nunca al revés. Buscar primero al paciente por teléfono a nivel global
 * significa que dos consultorios con el mismo paciente se pisan el expediente.
 *
 * Antes de esto, el webhook resolvía con `organization.findFirst()`: con dos
 * consultorios dados de alta, TODOS los mensajes de todos los pacientes caían
 * en el primero.
 *
 * Este módulo vive en lib/ y no en app/: dentro de app/ el bundler de Next deja
 * `process.env` sin definir en la capa RSC y el módulo truena al cargarse.
 */

export type WhatsappRoute = {
  organizationId: string;
  /** Credenciales de envío de ESTE consultorio. */
  credentials: WhatsappCredentials;
};

export type WhatsappCredentials = {
  phoneNumberId: string;
  accessToken: string;
};

/**
 * Resuelve a qué consultorio pertenece un mensaje entrante.
 *
 * Devuelve null cuando el número no está dado de alta o su consultorio está
 * suspendido. Quien llama DEBE descartar el mensaje en ese caso: adivinar el
 * consultorio es exactamente el error que esta función existe para evitar.
 */
export async function resolveRouteByInstance(
  instanceId: string | undefined,
  provider = "META"
): Promise<WhatsappRoute | null> {
  if (!instanceId) return null;

  const conn = await db.whatsappConnection.findUnique({
    where: { provider_instanceId: { provider, instanceId } },
    include: { organization: { select: { id: true, isActive: true } } },
  });

  if (conn && conn.isActive && conn.organization.isActive) {
    return {
      organizationId: conn.organizationId,
      credentials: {
        phoneNumberId: conn.instanceId,
        // Sin token propio se usa el del entorno: es el caso de la instalación
        // de un solo consultorio, que hoy sigue viviendo en variables.
        accessToken: conn.accessToken ?? WHATSAPP_CONFIG.accessToken,
      },
    };
  }

  // Conexión inactiva o consultorio suspendido: se descarta explícitamente,
  // sin caer al respaldo de entorno.
  if (conn) return null;

  return resolveLegacyEnvRoute(instanceId);
}

/**
 * Respaldo para la instalación de un solo consultorio, que todavía tiene el
 * número en variables de entorno y ninguna fila en `whatsapp_connections`.
 *
 * Es deliberadamente estricto: el `phone_number_id` debe coincidir con el del
 * entorno Y debe existir exactamente UN consultorio activo. Con dos o más ya
 * no hay forma de saber de quién es el mensaje, así que se descarta en vez de
 * adivinar. Ese "adivinar" era el bug original.
 */
async function resolveLegacyEnvRoute(instanceId: string): Promise<WhatsappRoute | null> {
  if (!WHATSAPP_CONFIG.phoneNumberId || instanceId !== WHATSAPP_CONFIG.phoneNumberId) {
    return null;
  }

  const orgs = await db.organization.findMany({
    where: { isActive: true },
    select: { id: true },
    take: 2, // con 2 basta para saber que ya no es instalación de uno solo
  });

  if (orgs.length !== 1) return null;

  return {
    organizationId: orgs[0].id,
    credentials: {
      phoneNumberId: WHATSAPP_CONFIG.phoneNumberId,
      accessToken: WHATSAPP_CONFIG.accessToken,
    },
  };
}

/**
 * Credenciales de envío de un consultorio, para mensajes que iniciamos
 * nosotros (recordatorios). Sin fila propia cae al entorno, igual que arriba.
 */
export async function credentialsForOrganization(
  organizationId: string
): Promise<WhatsappCredentials | null> {
  const conn = await db.whatsappConnection.findFirst({
    where: { organizationId, isActive: true },
  });

  if (conn) {
    return {
      phoneNumberId: conn.instanceId,
      accessToken: conn.accessToken ?? WHATSAPP_CONFIG.accessToken,
    };
  }

  if (WHATSAPP_CONFIG.phoneNumberId && WHATSAPP_CONFIG.accessToken) {
    return {
      phoneNumberId: WHATSAPP_CONFIG.phoneNumberId,
      accessToken: WHATSAPP_CONFIG.accessToken,
    };
  }

  return null;
}
