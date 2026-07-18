"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Calendar, CheckCircle2, AlertTriangle, RefreshCw, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import {
  disconnectGoogleAction,
  syncGoogleNowAction,
  toggleGoogleSyncAction,
  type ActionState,
} from "@/lib/actions/google";

export type GoogleConnection = {
  googleEmail: string;
  pullBusy: boolean;
  pushEvents: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
} | null;

function Submit({ label, pendingLabel, variant = "outline", icon }: {
  label: string;
  pendingLabel: string;
  variant?: "primary" | "outline" | "ghost";
  icon?: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {icon}
      {pending ? pendingLabel : label}
    </Button>
  );
}

function Feedback({ state }: { state: ActionState }) {
  if (!state) return null;
  if (!state.ok) return <Alert>{state.message}</Alert>;
  return (
    <p className="flex items-center gap-1.5 text-sm font-medium text-accent">
      <CheckCircle2 className="h-4 w-4" />
      {state.message}
    </p>
  );
}

/**
 * Conexión del calendario de Google de un médico.
 *
 * Los dos sentidos se controlan por separado a propósito: hay médicos que
 * quieren que su agenda personal les bloquee horarios pero NO que sus citas
 * aparezcan en el mismo calendario que comparten con su familia.
 */
export function GoogleCalendarSection({
  doctorId,
  doctorName,
  connection,
  configured,
}: {
  doctorId: string;
  doctorName: string;
  connection: GoogleConnection;
  configured: boolean;
}) {
  const [syncState, syncAction] = useFormState(syncGoogleNowAction, null as ActionState);
  const [offState, offAction] = useFormState(disconnectGoogleAction, null as ActionState);
  const [prefState, prefAction] = useFormState(toggleGoogleSyncAction, null as ActionState);

  if (!configured) {
    return (
      <div className="rounded-md border border-border p-4">
        <p className="mb-1 font-medium">Google Calendar</p>
        <p className="text-sm text-muted-foreground">
          Falta configurar las credenciales de Google en el servidor
          (<code className="text-xs">GOOGLE_CLIENT_ID</code> y <code className="text-xs">GOOGLE_CLIENT_SECRET</code>).
        </p>
      </div>
    );
  }

  if (!connection) {
    return (
      <div className="rounded-md border border-border p-4">
        <p className="mb-1 font-medium">Google Calendar</p>
        <p className="mb-3 text-sm text-muted-foreground">
          Conecta el calendario de {doctorName} para que sus eventos personales bloqueen horarios y sus citas
          aparezcan en su teléfono.
        </p>
        <a href={`/api/integrations/google/connect?doctorId=${doctorId}`}>
          <Button type="button" size="sm">
            <Calendar className="h-4 w-4" />
            Conectar Google Calendar
          </Button>
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-4 w-4 text-accent" />
            Google Calendar conectado
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {connection.googleEmail}
            {connection.lastSyncedAt &&
              ` · última sincronización ${new Date(connection.lastSyncedAt).toLocaleString("es-MX", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}`}
          </p>
        </div>
        <div className="flex gap-2">
          <form action={syncAction}>
            <input type="hidden" name="doctorId" value={doctorId} />
            <Submit
              label="Sincronizar ahora"
              pendingLabel="Sincronizando..."
              icon={<RefreshCw className="h-4 w-4" />}
            />
          </form>
          <form action={offAction}>
            <input type="hidden" name="doctorId" value={doctorId} />
            <Submit
              label="Desconectar"
              pendingLabel="Desconectando..."
              variant="ghost"
              icon={<Unlink className="h-4 w-4" />}
            />
          </form>
        </div>
      </div>

      {connection.lastError && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {connection.lastError}
        </div>
      )}

      <form action={prefAction} className="space-y-2 border-t border-border pt-3">
        <input type="hidden" name="doctorId" value={doctorId} />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="pullBusy" defaultChecked={connection.pullBusy} className="mt-0.5" />
          <span>
            <b>Bloquear con mi agenda personal.</b>
            <span className="block text-xs text-muted-foreground">
              Los eventos de tu Google bloquean esos horarios en Doctovio. Solo se lee la hora: el título de tus
              eventos privados nunca se guarda.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="pushEvents" defaultChecked={connection.pushEvents} className="mt-0.5" />
          <span>
            <b>Publicar mis citas en Google.</b>
            <span className="block text-xs text-muted-foreground">
              Cada cita aparece como evento en tu calendario. Sin datos clínicos: solo nombre, folio y motivo.
            </span>
          </span>
        </label>
        <Submit label="Guardar preferencias" pendingLabel="Guardando..." />
      </form>

      <Feedback state={syncState} />
      <Feedback state={offState} />
      <Feedback state={prefState} />
    </div>
  );
}
