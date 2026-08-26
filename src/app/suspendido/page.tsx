import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { getSession, isClinicSuspended } from "@/lib/auth/session";
import { LogoHorizontal } from "@/components/brand/logo";
import { logoutAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Cuenta suspendida" };

/**
 * Pantalla de consultorio suspendido.
 *
 * Vive FUERA del grupo (app) a propósito: ese layout redirige aquí, y montarla
 * dentro provocaría un ciclo infinito de redirecciones.
 *
 * Tampoco llama a requireSession(): esa función es justamente la que redirige
 * hacia acá. Usa getSession(), que solo lee el token.
 *
 * El mensaje deja claro que NO se perdió nada. Es lo primero que alguien piensa
 * al ver una pantalla así, y tratándose de expedientes clínicos esa duda es
 * seria.
 */
export default async function SuspendidoPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Si ya lo reactivaron, que nadie se quede atorado en esta pantalla.
  if (!(await isClinicSuspended(session.userId))) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-card">
        <LogoHorizontal className="h-10" />

        <div className="mt-8 flex h-12 w-12 items-center justify-center rounded-full bg-warning/10">
          <ShieldAlert className="h-6 w-6 text-warning" aria-hidden />
        </div>

        <h1 className="mt-5 text-xl font-semibold text-navy">Cuenta suspendida</h1>

        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          El acceso de este consultorio está temporalmente suspendido. Mientras
          tanto no se pueden consultar ni registrar datos.
        </p>

        <div className="mt-5 rounded-lg bg-muted p-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            <span className="font-medium text-navy">Tu información está intacta.</span>{" "}
            Pacientes, expedientes, citas, recetas e historial se conservan
            completos. Al reactivar la cuenta, todo vuelve a estar disponible tal
            como lo dejaste.
          </p>
        </div>

        <p className="mt-5 text-sm text-muted-foreground">
          Para reactivarla, escribe a{" "}
          <a href="mailto:soporte@doctovio.com" className="font-medium text-primary hover:underline">
            soporte@doctovio.com
          </a>
          .
        </p>

        <form action={logoutAction} className="mt-8">
          <Button type="submit" variant="secondary" className="w-full">
            Cerrar sesión
          </Button>
        </form>
      </div>
    </main>
  );
}
