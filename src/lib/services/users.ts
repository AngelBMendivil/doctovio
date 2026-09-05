import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { looksLikeEmail } from "@/lib/utils/clinic-code";
import type { UserRoleName } from "@prisma/client";

export async function listUsers(organizationId: string) {
  return db.user.findMany({
    where: { organizationId, isActive: true },
    orderBy: { fullName: "asc" },
    include: { doctorProfile: true },
  });
}

export async function listDoctors(organizationId: string) {
  return db.user.findMany({
    where: { organizationId, isActive: true, primaryRole: "DOCTOR" },
    orderBy: { fullName: "asc" },
    include: { doctorProfile: true },
  });
}

export async function createUser(params: {
  organizationId: string;
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  role: UserRoleName;
  createdBy?: string;
}) {
  const passwordHash = await hashPassword(params.password);
  return db.user.create({
    data: {
      organizationId: params.organizationId,
      email: params.email.toLowerCase().trim(),
      passwordHash,
      fullName: params.fullName,
      phone: params.phone,
      primaryRole: params.role,
      createdBy: params.createdBy,
    },
  });
}

/** Edita un usuario existente de la organización: nombre, teléfono, rol y,
 *  opcionalmente, la contraseña (si no se envía, se conserva la actual).
 *  El correo no se modifica. */
export async function updateUser(
  organizationId: string,
  userId: string,
  data: { fullName: string; phone?: string; role: UserRoleName; password?: string }
) {
  const user = await db.user.findFirst({ where: { id: userId, organizationId } });
  if (!user) throw new Error("El usuario no existe en esta organización.");

  const updateData: {
    fullName: string;
    phone: string | null;
    primaryRole: UserRoleName;
    passwordHash?: string;
  } = {
    fullName: data.fullName,
    phone: data.phone ?? null,
    primaryRole: data.role,
  };
  if (data.password) {
    updateData.passwordHash = await hashPassword(data.password);
  }

  return db.user.update({ where: { id: userId }, data: updateData });
}

/** Crea o actualiza el perfil profesional de un médico de la organización. */
export async function upsertDoctorProfile(
  organizationId: string,
  userId: string,
  data: {
    specialty?: string;
    subspecialty?: string;
    licenseNumber?: string;
    specialtyLicense?: string;
    licensesText?: string;
    ssaNumber?: string;
    stateRegistration?: string;
    rfc?: string;
    professionalPhone?: string;
    professionalEmail?: string;
    city?: string;
    state?: string;
  }
) {
  // Verifica que el usuario pertenezca a la organización y sea médico.
  const user = await db.user.findFirst({
    where: { id: userId, organizationId, primaryRole: "DOCTOR" },
  });
  if (!user) throw new Error("El usuario no existe o no es un médico de esta organización.");

  const values = {
    specialty: data.specialty ?? null,
    subspecialty: data.subspecialty ?? null,
    licenseNumber: data.licenseNumber ?? null,
    specialtyLicense: data.specialtyLicense ?? null,
    licensesText: data.licensesText ?? null,
    ssaNumber: data.ssaNumber ?? null,
    stateRegistration: data.stateRegistration ?? null,
    rfc: data.rfc ?? null,
    professionalPhone: data.professionalPhone ?? null,
    professionalEmail: data.professionalEmail ?? null,
    city: data.city ?? null,
    state: data.state ?? null,
  };

  return db.doctorProfile.upsert({
    where: { userId },
    update: values,
    create: { organizationId, userId, ...values },
  });
}

export async function findUserByEmail(organizationId: string, email: string) {
  return db.user.findUnique({
    where: { organizationId_email: { organizationId, email: email.toLowerCase().trim() } },
  });
}

/**
 * Restablece la contraseña de un usuario buscándolo por correo, sin pasar por
 * un consultorio.
 *
 * Solo la usa el script de terminal, que exige acceso a la máquina y a la base.
 * NO se expone por la interfaz: una pantalla que permita cambiarle la
 * contraseña a cualquiera por correo es una puerta de entrada, no una comodidad.
 *
 * Existe porque las contraseñas se guardan como hash bcrypt y son
 * irrecuperables por diseño: cuando alguien la olvida, el único camino es
 * ponerle una nueva.
 */
export async function resetUserPasswordGlobal(email: string, newPassword: string) {
  const normalized = email.toLowerCase().trim();

  if (newPassword.length < 8) {
    throw new Error("La contraseña debe tener al menos 8 caracteres.");
  }

  const user = await db.user.findUnique({ where: { email: normalized } });
  if (!user) throw new Error(`No existe ningún usuario con el correo ${normalized}.`);

  return db.user.update({
    where: { email: normalized },
    data: { passwordHash: await hashPassword(newPassword) },
    select: { email: true, fullName: true },
  });
}

/**
 * Busca un usuario por correo en TODA la plataforma. La usa el login, que aún
 * no sabe a qué consultorio pertenece quien está entrando.
 *
 * Es `findUnique`, no `findFirst`: el correo es único a nivel plataforma
 * (@@unique([email]) en el modelo User). Antes era un `findFirst` y con dos
 * consultorios que compartieran correo devolvía uno al azar — Postgres no
 * garantiza orden sin ORDER BY. Eso metía a la persona al consultorio
 * equivocado o la dejaba fuera del suyo.
 *
 * El filtro de isActive se hace después, no en el where: si estuviera en el
 * where, un usuario desactivado haría que la consulta no encuentre nada y el
 * login diría "credenciales inválidas" en vez de "tu cuenta está inactiva".
 */
export async function findUserByEmailGlobal(email: string) {
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });
  return user;
}

/**
 * Busca por correo O por nombre de acceso. La usa el login.
 *
 * El usuario principal de cada consultorio entra con su correo; los secundarios
 * con `clp.carlos`. Se distingue por la arroba: un nombre de acceso nunca la
 * lleva.
 *
 * Sigue siendo `findUnique` en los dos caminos — ambas columnas son únicas a
 * nivel plataforma. Nada de `findFirst` aquí: es exactamente el bug que ya nos
 * mordió tres veces.
 */
export async function findUserByLogin(identifier: string) {
  const id = identifier.toLowerCase().trim();
  if (!id) return null;

  return looksLikeEmail(id)
    ? db.user.findUnique({ where: { email: id } })
    : db.user.findUnique({ where: { username: id } });
}

/**
 * Restablece la contraseña por ID de usuario.
 *
 * Se prefiere sobre la versión por correo cuando ya se tiene al usuario en
 * pantalla: el id no cambia nunca, mientras que el correo sí se puede editar.
 * Un formulario que llevara el correo en un campo oculto apuntaría al valor
 * viejo si alguien lo acabara de cambiar.
 */
export async function resetUserPasswordById(userId: string, newPassword: string) {
  if (newPassword.length < 8) {
    throw new Error("La contraseña debe tener al menos 8 caracteres.");
  }

  return db.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword) },
    select: { id: true, email: true, fullName: true },
  });
}
