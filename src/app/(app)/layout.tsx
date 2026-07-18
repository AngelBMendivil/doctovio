import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { countNeedsHuman } from "@/lib/conversation/orchestrator";
import { AppShell } from "@/components/layout/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  // Conversaciones esperando a una persona: alimenta la campana del encabezado
  // para que nadie se quede colgado sin que el consultorio se entere.
  const pendingConversations = await countNeedsHuman(session.organizationId);

  return (
    <AppShell session={session} pendingConversations={pendingConversations}>
      {children}
    </AppShell>
  );
}
