import { NextResponse } from "next/server";
import { processDueReminders } from "@/lib/services/reminders";
import { CRON_SECRET } from "@/lib/cron/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Procesa los recordatorios que ya toca mandar.
 *
 * Lo llama un cron externo (cron-job.org, el scheduler de Railway, lo que sea)
 * cada 5-15 minutos. No hay sesión: quien llama es una máquina, así que se
 * protege con un secreto en el encabezado.
 *
 *   curl -H "Authorization: Bearer TU_CRON_SECRET" https://tu-dominio/api/cron/reminders
 *
 * Es idempotente: si se llama dos veces seguidas, la segunda no encuentra nada
 * pendiente. Cada recordatorio se manda una sola vez porque su fila cambia de
 * estado al enviarse.
 */
export async function GET(request: Request) {
  if (!CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET no está configurado." }, { status: 503 });
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const result = await processDueReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[cron] recordatorios:", e instanceof Error ? e.message : e);
    // 500 a propósito: que el cron lo marque como fallo y se note.
    return NextResponse.json({ ok: false, error: "Error al procesar recordatorios." }, { status: 500 });
  }
}
