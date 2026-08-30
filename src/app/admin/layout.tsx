import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, ArrowLeft } from "lucide-react";
import { getSession, isPlatformAdmin } from "@/lib/auth/session";
import { LogoHorizontal } from "@/components/brand/logo";

export const metadata: Metadata = { title: "Plataforma" };

/**
 * Panel del operador de plataforma.
 *
 * Vive FUERA del grupo (app) a propósito, y no es un detalle cosmético: aquel
 * layout redirige a /suspendido cuando el consultorio del usuario está
 * suspendido. Montado ahí dentro, el operador no podría entrar a reactivar
 * consultorios justo cuando más falta hace.
 *
 * Este panel maneja CONTEOS y cobranza. No da acceso a datos clínicos de
 * ningún consultorio, y no debería empezar a darlo sin una decisión aparte,
 * con consentimiento y bitácora.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  // Se comprueba contra la base, no contra el token: quitarle el privilegio a
  // alguien tiene que surtir efecto de inmediato, no en 7 días.
  if (!(await isPlatformAdmin(session.userId))) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-muted">
      <header className="border-b border-border bg-navy">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-4">
            <LogoHorizontal variant="blanco" className="h-8" />
            <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white">
              <Building2 className="h-3.5 w-3.5" aria-hidden />
              Plataforma
            </span>
          </div>

          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-white/60 sm:inline">{session.fullName}</span>
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 text-sm text-white/80 transition-colors hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Mi consultorio
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
