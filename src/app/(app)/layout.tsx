import { redirect } from "next/navigation";
import { getSession, isClinicSuspended } from "@/lib/auth/session";
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
  const pendingConversations = await countNeedsHuman(session.organizationId);

  return (
    <AppShell session={session} pendingConversations={pendingConversations}>
      {children}
    </AppShell>
  );
}
