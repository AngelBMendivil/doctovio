import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { exchangeCode, fetchGoogleEmail, saveConnection } from "@/lib/google/oauth";
import { pullBusyBlocks } from "@/lib/services/calendar-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vuelve a Configuración con el resultado, sin exponer detalles técnicos. */
const back = (request: Request, result: string) =>
  NextResponse.redirect(new URL(`/settings?google=${result}#medico`, request.url));

/**
 * Regreso de Google tras el consentimiento.
 *
 * Valida el `state` contra la cookie antes de tocar nada: es lo que impide que
 * un tercero conecte su propio calendario a la cuenta de otro.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", request.url));

  const { searchParams } = new URL(request.url);

  // El médico pudo cancelar en la pantalla de Google: no es un error.
  if (searchParams.get("error")) return back(request, "cancelled");

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const expected = cookies().get("google_oauth_state")?.value;
  cookies().delete("google_oauth_state");

  if (!code || !state || !expected || state !== expected) return back(request, "invalid_state");

  const doctorId = state.split(".")[1];
  if (!doctorId) return back(request, "invalid_state");

  // Se vuelve a verificar el permiso: la cookie prueba que el flujo es nuestro,
  // no que este usuario pueda tocar a este médico.
  if (session.role === "DOCTOR" && doctorId !== session.userId) return back(request, "forbidden");
  if (session.role !== "DOCTOR" && session.role !== "ADMIN") return back(request, "forbidden");

  const doctor = await db.user.findFirst({
    where: { id: doctorId, organizationId: session.organizationId, primaryRole: "DOCTOR" },
  });
  if (!doctor) return back(request, "invalid_doctor");

  try {
    const tokens = await exchangeCode(code);
    const email = await fetchGoogleEmail(tokens.accessToken);

    await saveConnection({
      organizationId: session.organizationId,
      doctorId,
      googleEmail: email,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    });

    // Primera traída de ocupación: que el médico vea el efecto de inmediato.
    // Si falla, la conexión ya quedó y se reintenta después.
    await pullBusyBlocks(doctorId).catch(() => undefined);

    return back(request, "connected");
  } catch (e) {
    console.error("[google] fallo al conectar:", e instanceof Error ? e.message : e);
    return back(request, "error");
  }
}
