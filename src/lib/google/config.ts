/**
 * Configuración de Google Calendar.
 *
 * Igual que con WhatsApp: las variables se leen AQUÍ, en lib/, y nunca dentro
 * de app/ — en la capa RSC del bundler `process.env` no existe.
 *
 * Variables (.env):
 *   GOOGLE_CLIENT_ID       de Google Cloud Console -> Credenciales -> OAuth
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_REDIRECT_URI    debe coincidir EXACTO con la registrada en Google
 */
export const GOOGLE_CONFIG = {
  clientId: process.env.GOOGLE_CLIENT_ID ?? "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  redirectUri:
    process.env.GOOGLE_REDIRECT_URI ??
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/integrations/google/callback`,
};

export function isGoogleConfigured(): boolean {
  return Boolean(GOOGLE_CONFIG.clientId && GOOGLE_CONFIG.clientSecret);
}

/**
 * Permisos que se le piden al médico.
 *
 * `calendar.events` alcanza para leer y escribir eventos; NO se pide
 * `calendar` completo, que además dejaría borrar calendarios enteros.
 * Menos permisos = menos daño si el token se filtra, y menos fricción en la
 * pantalla de consentimiento.
 */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];
