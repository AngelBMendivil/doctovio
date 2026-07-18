import crypto from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { buildAuthUrl } from "@/lib/google/oauth";
import { isGoogleConfigured } from "@/lib/google/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Inicia la conexión: manda al médico a la pantalla de consentimiento.
 *
 * El `state` es un valor aleatorio que se guarda en cookie y se compara al
 * volver. Sin él, alguien podría inducir a un admin a conectar el calendario
 * de un atacante (CSRF sobre OAuth).
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", request.url));
  if (session.role !== "ADMIN" && session.role !== "DOCTOR") {
    return NextResponse.redirect(new URL("/settings?google=forbidden", request.url));
  }
  if (!isGoogleConfigured()) {
    return NextResponse.redirect(new URL("/settings?google=unconfigured", request.url));
  }

  const { searchParams } = new URL(request.url);
  const doctorId = searchParams.get("doctorId");
  if (!doctorId) return NextResponse.redirect(new URL("/settings?google=missing_doctor", request.url));

  // Un médico solo puede conectar SU calendario; el admin puede conectar el de
  // cualquiera de su consultorio.
  if (session.role === "DOCTOR" && doctorId !== session.userId) {
    return NextResponse.redirect(new URL("/settings?google=forbidden", request.url));
  }

  const nonce = crypto.randomBytes(16).toString("hex");
  const state = `${nonce}.${doctorId}`;

  cookies().set("google_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutos: lo que dura autorizar
    path: "/",
  });

  return NextResponse.redirect(buildAuthUrl(state));
}
