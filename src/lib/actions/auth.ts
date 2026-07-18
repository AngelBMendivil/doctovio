"use server";

import { redirect } from "next/navigation";
import { findUserByEmailGlobal } from "@/lib/services/users";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { logAudit } from "@/lib/services/audit";
import { db } from "@/lib/db";

export type LoginState = { error?: string };

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    return { error: "Correo y contraseña son obligatorios." };
  }

  const user = await findUserByEmailGlobal(email);
  if (!user) {
    return { error: "Credenciales inválidas." };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return { error: "Credenciales inválidas." };
  }

  if (user.status !== "ACTIVE" || !user.isActive) {
    return { error: "Tu cuenta está inactiva. Contacta al administrador de tu consultorio." };
  }

  await createSession({
    userId: user.id,
    organizationId: user.organizationId,
    role: user.primaryRole,
    fullName: user.fullName,
    email: user.email,
  });

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await logAudit({ organizationId: user.organizationId, userId: user.id, action: "LOGIN", entity: "user", entityId: user.id });

  redirect("/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
