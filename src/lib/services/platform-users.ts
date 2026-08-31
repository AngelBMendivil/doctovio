import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { suggestUsername, resolveUsername } from "@/lib/utils/clinic-code";
import type { Prisma, UserRoleName, UserStatus } from "@prisma/client";

/**
 * USUARIOS VISTOS DESDE LA PLATAFORMA.
 *
 * A diferencia de `users.ts`, que siempre trabaja dentro de un consultorio,
 * esto cruza todos. Solo debe llamarse detrás de `requirePlatformAdmin()`.
 *
 * NUNCA borra usuarios: se desactivan. Un usuario borrado deja huérfanas las
 * citas que creó, las recetas que firmó y su rastro en la bitácora.
 */

export async function listAllUsers(filter: { organizationId?: string; role?: UserRoleName; status?: UserStatus; search?: string } = {}) {
  const where: Prisma.UserWhereInput = {
    organizationId: filter.organizationId,
    primaryRole: filter.role,
    status: filter.status,
    ...(filter.search
      ? {
          OR: [
            { fullName: { contains: filter.search, mode: "insensitive" } },
            { email: { contains: filter.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const users = await db.user.findMany({
    where,
    orderBy: [{ organizationId: "asc" }, { createdAt: "asc" }],
    take: 500,
    select: {
      id: true,
      fullName: true,
      email: true,
      username: true,
      primaryRole: true,
      status: true,
      isActive: true,
      isPlatformAdmin: true,
      lastLoginAt: true,
      createdAt: true,
      organization: { select: { id: true, name: true, status: true } },
    },
  });

  return users;
}

/**
 * Da de alta un usuario en un consultorio.
 *
 * Respeta `maxUsers` del plan. El tope se comprueba AQUÍ y no en la interfaz:
 * un formulario enviado a mano se saltaría cualquier validación de pantalla.
 *
 * El correo es único en toda la plataforma, no por consultorio: el login busca
 * por correo antes de saber a qué consultorio pertenece la persona.
 */
export async function createUserAsMaster(params: {
  organizationId: string;
  /** Obligatorio: sin correo no hay forma de recuperar la cuenta. */
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  role: UserRoleName;
}) {
  const email = params.email.toLowerCase().trim();

  if (!email) throw new Error("El correo es obligatorio.");
  if (params.password.length < 8) {
    throw new Error("La contraseña debe tener al menos 8 caracteres.");
  }

  const existe = await db.user.findUnique({ where: { email } });
  if (existe) {
    throw new Error(`El correo ${email} ya está en uso en la plataforma.`);
  }

  const org = await db.organization.findUniqueOrThrow({
    where: { id: params.organizationId },
    select: { code: true, name: true, maxUsers: true, _count: { select: { users: true } } },
  });

  if (org._count.users >= org.maxUsers) {
    throw new Error(
      `"${org.name}" ya tiene ${org._count.users} de ${org.maxUsers} usuarios de su plan. ` +
        `Sube el tope antes de agregar otro.`
    );
  }

  // Alias de acceso: clp.carlos. Se genera siempre, ADEMÁS del correo. El
  // login acepta los dos, y el alias es bastante más rápido de teclear todos
  // los días que un correo completo.
  //
  // Se resuelve el choque contra los que ya existen: dos Carlos en el mismo
  // consultorio dan clp.carlos y clp.carlos2.
  const base = suggestUsername(org.code, params.fullName);
  if (!base) {
    throw new Error("El nombre no tiene letras suficientes para generar un usuario.");
  }

  const ocupados = new Set(
    (await db.user.findMany({ where: { username: { startsWith: `${org.code.toLowerCase()}.` } }, select: { username: true } }))
      .map((u) => u.username)
      .filter((u): u is string => Boolean(u))
  );
  const username = resolveUsername(base, ocupados);

  const passwordHash = await hashPassword(params.password);

  return db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        organizationId: params.organizationId,
        email,
        username,
        passwordHash,
        fullName: params.fullName.trim(),
        phone: params.phone?.trim() || null,
        primaryRole: params.role,
      },
    });

    // La tabla puente se mantiene al día desde el alta, para que el día que se
    // active multi-consultorio no haya que reconstruirla.
    await tx.clinicUser.create({
      data: {
        organizationId: params.organizationId,
        userId: user.id,
        role: params.role,
        isPrimary: true,
      },
    });

    return user;
  });
}

/** Activa o desactiva un usuario. Nunca lo borra. */
export async function setUserActive(userId: string, active: boolean) {
  return db.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: { isActive: active, status: active ? "ACTIVE" : "INACTIVE" },
      select: { id: true, fullName: true, email: true, isActive: true, organizationId: true },
    });

    await tx.clinicUser.updateMany({
      where: { userId },
      data: { status: active ? "ACTIVE" : "INACTIVE" },
    });

    return user;
  });
}

/** Cambia el rol dentro de su consultorio. */
export async function changeUserRole(userId: string, role: UserRoleName) {
  return db.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: { primaryRole: role },
      select: { id: true, fullName: true, organizationId: true },
    });

    await tx.clinicUser.updateMany({ where: { userId }, data: { role } });
    return user;
  });
}

/**
 * Mueve a un usuario de consultorio.
 *
 * OJO con lo que esto NO hace: su historial se queda donde está. Las citas que
 * creó, las recetas que firmó y su bitácora siguen perteneciendo al consultorio
 * anterior, y así debe ser — reasignarlas reescribiría el expediente clínico.
 * Lo único que cambia es a dónde entra de aquí en adelante.
 */
export async function moveUserToClinic(userId: string, organizationId: string) {
  const org = await db.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { name: true, maxUsers: true, _count: { select: { users: true } } },
  });

  if (org._count.users >= org.maxUsers) {
    throw new Error(`"${org.name}" ya llegó al tope de ${org.maxUsers} usuarios de su plan.`);
  }

  return db.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: { organizationId },
      select: { id: true, fullName: true, primaryRole: true },
    });

    // La pertenencia anterior deja de ser la primaria; se crea la nueva.
    await tx.clinicUser.updateMany({ where: { userId }, data: { isPrimary: false } });
    await tx.clinicUser.upsert({
      where: { organizationId_userId: { organizationId, userId } },
      create: { organizationId, userId, role: user.primaryRole, isPrimary: true },
      update: { isPrimary: true, status: "ACTIVE" },
    });

    return user;
  });
}
