import { db } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/utils/crypto";
import { GOOGLE_CONFIG, GOOGLE_SCOPES } from "./config";

/**
 * OAuth de Google, sin dependencias.
 *
 * Se usa fetch directo en vez de la librería `googleapis`: son tres llamadas
 * HTTP y evita meter un paquete de varios megas al proyecto.
 */

export class GoogleAuthError extends Error {
  constructor(message: string, public retryable = false) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

/**
 * URL a la que se manda al médico para que autorice.
 *
 * `access_type=offline` + `prompt=consent` son indispensables: sin ellos
 * Google no devuelve refresh token en reconexiones y la integración deja de
 * funcionar en cuanto expira el access token (una hora).
 */
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CONFIG.clientId,
    redirect_uri: GOOGLE_CONFIG.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

/** Cambia el código de autorización por tokens. Solo ocurre una vez, al conectar. */
export async function exchangeCode(code: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CONFIG.clientId,
      client_secret: GOOGLE_CONFIG.clientSecret,
      redirect_uri: GOOGLE_CONFIG.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const json = (await res.json()) as TokenResponse;
  if (!res.ok || !json.access_token) {
    throw new GoogleAuthError(json.error_description || json.error || "No se pudo completar la conexión con Google.");
  }
  if (!json.refresh_token) {
    // Pasa cuando el usuario ya había autorizado y Google no lo repite.
    throw new GoogleAuthError(
      "Google no devolvió el permiso de acceso continuo. Revoca el acceso a Doctovio en tu cuenta de Google y vuelve a conectar."
    );
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + (json.expires_in ?? 3600) * 1000),
  };
}

/** Qué cuenta autorizó: se muestra en pantalla para que el médico lo verifique. */
export async function fetchGoogleEmail(accessToken: string): Promise<string> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return "";
  const json = (await res.json()) as { email?: string };
  return json.email ?? "";
}

/**
 * Devuelve un access token vigente para un médico, renovándolo si hace falta.
 *
 * Es la única puerta para obtener el token: nadie más debe leer o descifrar el
 * refresh token. Se renueva con un minuto de margen para no usar uno que
 * expire a mitad de la petición.
 */
export async function getAccessToken(doctorId: string): Promise<string> {
  const conn = await db.googleCalendarConnection.findUnique({ where: { doctorId } });
  if (!conn) throw new GoogleAuthError("Este médico no tiene calendario conectado.");

  const margin = 60_000;
  if (conn.accessToken && conn.accessExpiresAt && conn.accessExpiresAt.getTime() - margin > Date.now()) {
    return conn.accessToken;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CONFIG.clientId,
      client_secret: GOOGLE_CONFIG.clientSecret,
      refresh_token: decryptSecret(conn.refreshToken),
      grant_type: "refresh_token",
    }),
  });

  const json = (await res.json()) as TokenResponse;

  if (!res.ok || !json.access_token) {
    // invalid_grant = el médico revocó el acceso o cambió su contraseña.
    // No sirve reintentar: hay que pedirle que reconecte.
    const fatal = json.error === "invalid_grant";
    await db.googleCalendarConnection.update({
      where: { doctorId },
      data: {
        lastError: fatal
          ? "El médico revocó el acceso en su cuenta de Google. Hay que reconectar el calendario."
          : json.error_description || "No se pudo renovar el acceso a Google.",
      },
    });
    throw new GoogleAuthError(
      fatal ? "El acceso a Google fue revocado. Reconecta el calendario." : "No se pudo renovar el acceso a Google.",
      !fatal
    );
  }

  const expiresAt = new Date(Date.now() + (json.expires_in ?? 3600) * 1000);
  await db.googleCalendarConnection.update({
    where: { doctorId },
    data: { accessToken: json.access_token, accessExpiresAt: expiresAt, lastError: null },
  });

  return json.access_token;
}

/** Guarda la conexión. El refresh token entra cifrado, nunca en claro. */
export async function saveConnection(params: {
  organizationId: string;
  doctorId: string;
  googleEmail: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}) {
  const data = {
    organizationId: params.organizationId,
    googleEmail: params.googleEmail,
    refreshToken: encryptSecret(params.refreshToken),
    accessToken: params.accessToken,
    accessExpiresAt: params.expiresAt,
    lastError: null,
  };

  return db.googleCalendarConnection.upsert({
    where: { doctorId: params.doctorId },
    update: data,
    create: { ...data, doctorId: params.doctorId },
  });
}

/** Desconecta y revoca el permiso en Google, no solo en nuestra base. */
export async function disconnect(doctorId: string) {
  const conn = await db.googleCalendarConnection.findUnique({ where: { doctorId } });
  if (!conn) return;

  try {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: decryptSecret(conn.refreshToken) }),
    });
  } catch {
    // Si Google no responde, se borra igual: el médico pidió desconectar y
    // dejarle el registro sería peor que no revocar del lado de Google.
  }

  await db.googleCalendarConnection.delete({ where: { doctorId } });
}
