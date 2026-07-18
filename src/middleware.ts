import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || "mvp_session";

/**
 * Rutas sin sesión.
 *
 * Ojo: las dos últimas NO son públicas en el sentido de "cualquiera entra".
 * Simplemente no se protegen con cookie, porque quien llama es una máquina y
 * no un navegador:
 *
 *   /api/integrations  lo llama Meta  → se valida la firma HMAC del webhook
 *   /api/cron          lo llama el cron → se valida el CRON_SECRET del header
 *
 * Si se dejan fuera de esta lista, el middleware las redirige al login y el
 * que llama recibe un 307 que nunca sabe interpretar.
 */
const PUBLIC_PATHS = ["/login", "/public", "/api/public", "/api/integrations", "/api/cron"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || pathname.startsWith("/_next") || pathname === "/favicon.ico";
}

async function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

/**
 * Guard global de autenticación. La autorización fina por rol (RBAC) se
 * revisa además en cada Server Action / Route Handler, esto es solo la
 * primera barrera (redirigir a /login si no hay sesión válida).
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const secretKey = await getSecretKey();

  if (!token || !secretKey) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  try {
    await jwtVerify(token, secretKey);
    return NextResponse.next();
  } catch {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
