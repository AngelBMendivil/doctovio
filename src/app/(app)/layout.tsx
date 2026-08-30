import { redirect } from "next/navigation";
import { getSession, isClinicSuspended, isPlatformAdmin } from "@/lib/auth/session";
import { countNeedsHuman } from "@/lib/conversation/orchestrator";
import { AppShell } from "@/components/layout/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  // La cookie vive 7 días y no se entera de nada. Sin esta consulta, suspender
  // un consultorio no lo suspende: sigue operando hasta que expire el token.
  if (await isClinicSuspended(session.userId)) redirect("/suspendido");

  // Conversaciones esperando a una persona: alimenta la campana del encabezado
  // para que nadie se quede colgado sin que el consultorio se entere.
  //
  // La bandera de plataforma NO viaja en el token: se lee de la base, igual que
  // la suspensión. Ambas consultas comparten el mismo `cache()` por request, así
  // que esto no agrega una segunda vuelta a la base.
  const [pendingConversations, platformAdmin] = await Promise.all([
    countNeedsHuman(session.organizationId),
    isPlatformAdmin(session.userId),
  ]);

  return (
    <AppShell
      session={{ ...session, isPlatformAdmin: platformAdmin }}
      pendingConversations={pendingConversations}
    >
      {children}
    </AppShell>
  );
}
