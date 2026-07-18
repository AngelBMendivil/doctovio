import "server-only";
import { Resend } from "resend";

let client: Resend | null = null;

function getClient(): Resend {
  if (!client) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY no está configurado.");
    client = new Resend(apiKey);
  }
  return client;
}

export async function sendEmail(params: { to: string; subject: string; html: string }) {
  const from = process.env.RESEND_FROM_EMAIL || "notificaciones@example.com";
  return getClient().emails.send({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });
}
