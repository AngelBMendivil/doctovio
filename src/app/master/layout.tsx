import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { getSession, isPlatformAdmin } from "@/lib/auth/session";
import { LogoHorizontal } from "@/components/brand/logo";
import { MasterNav } from "@/components/master/master-nav";

export const metadata: Metadata = { title: "Administrador Maestro" };

/**
 * PANEL DEL ADMINISTRADOR MAESTRO.
 *
 * Vive FUERA del grupo (app) a propósito, y no es cosmético: aquel layout
 * redirige a /suspendido cuando el consultorio del usuario está suspendido.
 * Montado ahí dentro, el Master no podría entrar a reactivar consultorios justo
 * cuando más falta hace.
 *
 * ALCANCE: administración del SaaS. Conteos, cobranza, usuarios y catálogo.
 * NO da acceso a expedientes clínicos de ningún consultorio — el Master ve que
 * una clínica tiene 300 pacientes, nunca quiénes son. Esa frontera se decidió a
 * propósito y no debe cruzarse sin una decisión aparte.
 *
 * Esconder el menú no es seguridad: cada página y cada acción llaman a
 * `requirePlatformAdmin()` por su cuenta.
 */
export default async function MasterLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  // Contra la base, no contra el token: quitarle el privilegio a alguien tiene
  // que surtir efecto de inmediato, no en 7 días.
  if (!(await isPlatformAdmin(session.userId))) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-muted lg:flex">
      <aside className="flex flex-col border-b border-white/10 bg-navy lg:min-h-screen lg:w-60 lg:border-b-0 lg:border-r">
        <div className="px-5 py-5">
          <LogoHorizontal variant="blanco" className="h-8" />
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white">
            <ShieldCheck className="h-3 w-3" aria-hidden />
            Administrador Maestro
          </span>
        </div>

        <MasterNav />

        <div className="mt-auto border-t border-white/10 px-3 py-4">
          <div className="px-2 pb-3">
            <p className="truncate text-[13px] font-medium text-white">{session.fullName}</p>
            <p className="truncate text-[11px] text-white/50">{session.email}</p>
          </div>
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Mi consultorio
          </Link>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-6 py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
