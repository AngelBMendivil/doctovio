import { redirect } from "next/navigation";
import { getSession, isClinicSuspended, isPlatformAdmin } from "@/lib/auth/session";
import { countNeedsHuman } from "@/lib/conversation/orchestrator";
import { isDentalClinic } from "@/lib/services/clinic-features";
import { AppShell } from "@/components/layout/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  // La cookie vive 7 días y no se entera de nada. Sin esta consulta, suspender
  // un consultorio no lo suspende: sigue operando hasta que expire el token.
  if (await isClinicSuspended(session.userId)) redirect("/suspendido");

  // El operador de plataforma NO opera consultorios. Su panel maneja conteos y
  // cobranza; los expedientes clinicos de cada clinica son de esa clinica.
  //
  // Sin esta linea la separacion era solo de intencion: bastaba escribir
  // /dashboard en la barra para entrar como administrador del consultorio y ver
  // los expedientes completos. Es el mismo acceso que dejamos fuera al
  // descartar "Ver como consultorio", entrando por otra puerta.
  if (await isPlatformAdmin(session.userId)) redirect("/master");

  // Conversaciones esperando a una persona: alimenta la campana del encabezado
  // para que nadie se quede colgado sin que el consultorio se entere.
  const pendingConversations = await countNeedsHuman(session.organizationId);

  // El giro del consultorio decide qué se MUESTRA. Las rutas del módulo dental
  // vuelven a comprobarlo del lado del servidor: ocultar un enlace no protege
  // nada, la dirección se escribe a mano.
  const dental = await isDentalClinic(session.organizationId);

  // Aquí ya no hay operadores de plataforma: la línea de arriba los sacó. Por
  // eso el enlace a /master no se pasa, no aparecería para nadie.
  return (
    <AppShell session={session} pendingConversations={pendingConversations} dental={dental}>
      {children}
    </AppShell>
  );
}
