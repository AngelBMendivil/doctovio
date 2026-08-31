import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import type { UserRoleName } from "@prisma/client";
import { db } from "@/lib/db";

export type SessionPayload = {
  userId: string;
  organizationId: string;
  role: UserRoleName;
  fullName: string;
  email: string;
  /** Alias corto `clp.carlos`, si tiene. El login acepta correo o alias. */
  username?: string | null;
  /**
   * NO viaja en el token: lo agrega requireSession() al revalidar contra la
   * base. Si estuviera firmado en el JWT quedaría congelado 7 días y volvería
   * a pasar lo que este campo existe para evitar.
   */
  clinicActive?: boolean;
  /**
   * Operador de plataforma. Tampoco viaja en el token, y por la misma razón:
   * quitarle el privilegio a alguien tiene que surtir efecto ya, no en 7 días.
   */
  isPlatformAdmin?: boolean;
};

const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || "mvp_session";
const MAX_AGE = Number(process.env.AUTH_SESSION_MAX_AGE || 604800); // 7 dias

function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET no está configurado. Define esta variable de entorno.");
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(getSecretKey());

  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function destroySession() {
  cookies().delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Estado real de la cuenta, leído de la base.
 *
 * El JWT es autocontenido y vive 7 días: por sí solo NO se entera de que un
 * consultorio fue suspendido ni de que un usuario fue dado de baja. Sin esta
 * revalidación, suspender un consultorio no suspende absolutamente nada hasta
 * que expire la cookie.
 *
 * `cache()` de React deduplica la consulta dentro del mismo request: una
 * página que llame a requireSession() cinco veces hace UNA sola query.
 */
const loadAccountState = cache(async (userId: string) => {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      status: true,
      isActive: true,
      isPlatformAdmin: true,
      organizationId: true,
      organization: { select: { isActive: true } },
    },
  });
  if (!user) return null;

  return {
    userActive: user.isActive && user.status === "ACTIVE",
    organizationId: user.organizationId,
    clinicActive: user.organization.isActive,
    isPlatformAdmin: user.isPlatformAdmin,
  };
});

/**
 * Lanza si no hay sesión activa. Usar en Server Actions / Route Handlers.
 *
 * Ojo: aquí NO se llama a destroySession(). Muchos server components llaman a
 * esta función durante el render, y Next prohíbe modificar cookies fuera de un
 * Server Action o Route Handler: borrar la cookie aquí truena la página con un
 * error que no dice nada. Se lanza y ya; el middleware manda al login.
 */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new Error("UNAUTHENTICATED");
  }

  const state = await loadAccountState(session.userId);

  // Usuario borrado, inactivo o suspendido.
  if (!state || !state.userActive) {
    throw new Error("UNAUTHENTICATED");
  }

  // El consultorio del token ya no es el del usuario: token viejo o manipulado.
  if (state.organizationId !== session.organizationId) {
    throw new Error("UNAUTHENTICATED");
  }

  // Consultorio suspendido: se corta la operación por completo, en un solo
  // punto. Se redirige en vez de lanzar porque redirect() sí funciona tanto en
  // server components como en server actions, y da un mensaje entendible en
  // lugar de la pantalla de error de Next.
  //
  // Suspender NO borra nada: los datos siguen intactos y al reactivar el
  // consultorio todo vuelve a funcionar sin ningún paso extra.
  if (!state.clinicActive) {
    redirect("/suspendido");
  }

  return { ...session, clinicActive: true, isPlatformAdmin: state.isPlatformAdmin };
}

/**
 * Exige ser operador de plataforma. Es la única puerta de /admin.
 *
 * Se comprueba SIEMPRE contra la base, nunca contra el token: quitarle el
 * privilegio a alguien tiene que surtir efecto de inmediato.
 *
 * Ojo con lo que esto NO hace: no da acceso a los datos clínicos de ningún
 * consultorio. El operador ve cuántos pacientes tiene cada uno, jamás quiénes
 * son. Si algún día hiciera falta entrar al expediente de un consultorio para
 * dar soporte, eso es otra decisión —con consentimiento y bitácora— y no debe
 * colarse por esta puerta.
 */
export async function requirePlatformAdmin(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");

  const state = await loadAccountState(session.userId);
  if (!state || !state.userActive) throw new Error("UNAUTHENTICATED");
  if (!state.isPlatformAdmin) throw new Error("FORBIDDEN");

  // A propósito NO se valida `clinicActive`: el operador de plataforma tiene
  // que poder entrar al panel justamente cuando hay consultorios suspendidos
  // —incluido el suyo— para reactivarlos.
  return { ...session, isPlatformAdmin: true, clinicActive: state.clinicActive };
}

/** ¿Este usuario ve el enlace al panel de plataforma? Para la interfaz. */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const state = await loadAccountState(userId);
  return state?.isPlatformAdmin ?? false;
}

/**
 * Alias explícito de requireSession() para operaciones que ESCRIBEN.
 *
 * Hoy hace lo mismo (requireSession ya bloquea consultorios suspendidos), pero
 * deja la intención escrita en el código y da un lugar donde endurecer después
 * sin tocar los llamados.
 */
export async function requireActiveClinic(): Promise<SessionPayload> {
  return requireSession();
}

/** ¿El consultorio de este usuario está suspendido? Para el layout. */
export async function isClinicSuspended(userId: string): Promise<boolean> {
  const state = await loadAccountState(userId);
  return state ? !state.clinicActive : false;
}

/**
 * Verifica que la sesión pueda tocar datos de ESE consultorio.
 *
 * Es la barrera para cualquier caso donde el id del consultorio no venga
 * directo de la sesión.
 */
export async function requireClinicAccess(organizationId: string): Promise<SessionPayload> {
  const session = await requireSession();
  if (session.organizationId !== organizationId) {
    throw new Error("FORBIDDEN");
  }
  return session;
}

/** Lanza si el rol del usuario no está en la lista permitida. */
export async function requireRole(roles: UserRoleName[]): Promise<SessionPayload> {
  const session = await requireSession();
  if (!roles.includes(session.role)) {
    throw new Error("FORBIDDEN");
  }
  return session;
}
