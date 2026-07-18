import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
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

/** Busca un usuario por correo en TODAS las organizaciones (para el login,
 *  ya que el usuario aún no sabe a qué organización pertenece). */
export async function findUserByEmailGlobal(email: string) {
  return db.user.findFirst({
    where: { email: email.toLowerCase().trim(), isActive: true },
  });
}
