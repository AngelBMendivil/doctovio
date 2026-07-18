import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email/resend";
import { templates } from "@/lib/email/templates";
import type { NotificationType } from "@prisma/client";

type NotifyParams = {
  organizationId: string;
  type: NotificationType;
  to: string;
  subject: string;
  template: keyof typeof templates;
  templateParams: Record<string, string>;
  relatedEntity?: string;
  relatedId?: string;
};

/**
 * Envía una notificación por correo vía Resend y registra el intento en
 * notification_logs (destinatario, tipo, estado, id del proveedor, error,
 * reintentos). El fallo de envío NUNCA debe tumbar el flujo principal:
 * se captura, se registra y se puede reintentar después.
 */
export async function sendNotification(params: NotifyParams) {
  const log = await db.notificationLog.create({
    data: {
      organizationId: params.organizationId,
      recipient: params.to,
      channel: "EMAIL",
      type: params.type,
      status: "PENDING",
      relatedEntity: params.relatedEntity,
      relatedId: params.relatedId,
    },
  });

  try {
    const html = templates[params.template](params.templateParams);
    const result = await sendEmail({ to: params.to, subject: params.subject, html });

    await db.notificationLog.update({
      where: { id: log.id },
      data: { status: "SENT", providerId: result.data?.id ?? null, sentAt: new Date() },
    });

    return { success: true, logId: log.id };
  } catch (error) {
    await db.notificationLog.update({
      where: { id: log.id },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Error desconocido",
        retryCount: { increment: 1 },
      },
    });
    return { success: false, logId: log.id, error };
  }
}

/**
 * Envío por WhatsApp Business Cloud API. Queda preparado a nivel de
 * arquitectura (contrato + registro en notification_logs) pero no envía
 * mensajes reales hasta que la organización tenga WHATSAPP_ENABLED=true
 * y credenciales válidas. No debe usarse para datos clínicos sensibles.
 */
export async function sendWhatsAppNotification(params: {
  organizationId: string;
  type: NotificationType;
  toPhone: string;
  templateName: string;
  templateParams: string[];
  relatedEntity?: string;
  relatedId?: string;
}) {
  const settings = await db.organizationSettings.findUnique({ where: { organizationId: params.organizationId } });

  const log = await db.notificationLog.create({
    data: {
      organizationId: params.organizationId,
      recipient: params.toPhone,
      channel: "WHATSAPP",
      type: params.type,
      status: "PENDING",
      relatedEntity: params.relatedEntity,
      relatedId: params.relatedId,
    },
  });

  if (!settings?.whatsappEnabled || process.env.WHATSAPP_ENABLED !== "true") {
    await db.notificationLog.update({
      where: { id: log.id },
      data: { status: "FAILED", errorMessage: "WhatsApp deshabilitado para esta organización." },
    });
    return { success: false, logId: log.id };
  }

  try {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const response = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: params.toPhone,
        type: "template",
        template: {
          name: params.templateName,
          language: { code: "es_MX" },
          components: [
            { type: "body", parameters: params.templateParams.map((text) => ({ type: "text", text })) },
          ],
        },
      }),
    });

    const json = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(json));

    await db.notificationLog.update({
      where: { id: log.id },
      data: { status: "SENT", providerId: json.messages?.[0]?.id ?? null, sentAt: new Date() },
    });
    return { success: true, logId: log.id };
  } catch (error) {
    await db.notificationLog.update({
      where: { id: log.id },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Error desconocido",
        retryCount: { increment: 1 },
      },
    });
    return { success: false, logId: log.id, error };
  }
}
