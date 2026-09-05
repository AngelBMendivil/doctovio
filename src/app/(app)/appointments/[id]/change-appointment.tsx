"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TimeSelect } from "../time-select";
import { rescheduleAppointmentAction, cancelAppointmentAction } from "@/lib/actions/appointments";
import { cn } from "@/lib/utils/cn";

/**
 * MOVER LA CITA: reprogramar o cancelar.
 *
 * Es UNA decisión con dos salidas —"esta cita no va a ser como está agendada"—,
 * no dos funciones sueltas. Antes eran dos tarjetas lado a lado, y eso le daba
 * a cancelar el mismo peso visual que a reprogramar: la acción que destruye el
 * horario se veía igual de normal que la que lo conserva.
 *
 * Reprogramar abre por omisión porque es lo que se hace nueve de cada diez
 * veces. Cancelar hay que elegirlo, escribir el motivo y confirmarlo.
 */

function Submit({ label, variant }: { label: string; variant?: "secondary" | "destructive" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant ?? "secondary"} disabled={pending}>
      {pending ? "Guardando..." : label}
    </Button>
  );
}

export function ChangeAppointment({
  appointmentId,
  fechaStr,
  hora,
  minuto,
  durationMinutes,
}: {
  appointmentId: string;
  fechaStr: string;
  hora: string;
  minuto: string;
  durationMinutes: number;
}) {
  const [modo, setModo] = useState<"reprogramar" | "cancelar">("reprogramar");

  const tab = (activo: boolean) =>
    cn(
      "rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
      activo ? "bg-card text-navy shadow-sm" : "text-muted-foreground hover:text-foreground"
    );

  return (
    <div className="space-y-4">
      <div className="inline-flex gap-1 rounded-lg bg-muted p-1">
        <button type="button" onClick={() => setModo("reprogramar")} className={tab(modo === "reprogramar")}>
          Reprogramar
        </button>
        <button type="button" onClick={() => setModo("cancelar")} className={tab(modo === "cancelar")}>
          Cancelar
        </button>
      </div>

      {modo === "reprogramar" ? (
        <form action={rescheduleAppointmentAction} className="space-y-3">
          <input type="hidden" name="appointmentId" value={appointmentId} />
          <input type="hidden" name="durationMinutes" value={durationMinutes} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="rd" required>Nueva fecha</Label>
              <Input id="rd" name="scheduledDate" type="date" defaultValue={fechaStr} required />
            </div>
            <div>
              <Label required>Nueva hora</Label>
              <TimeSelect defaultHour={hora} defaultMinute={minuto} />
            </div>
          </div>

          <div>
            <Label htmlFor="rr">Motivo del cambio</Label>
            <Input id="rr" name="reason" placeholder="El paciente lo pidió" />
          </div>

          <div className="flex items-center gap-3">
            <Submit label="Reprogramar" />
            <span className="text-xs text-muted-foreground">
              La cita conserva su historial: no se borra, se mueve.
            </span>
          </div>
        </form>
      ) : (
        <form
          action={cancelAppointmentAction}
          className="space-y-3"
          onSubmit={(e) => {
            if (!window.confirm("¿Cancelar esta cita? El horario queda libre y el paciente pierde su lugar.")) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="appointmentId" value={appointmentId} />

          <div>
            <Label htmlFor="cr" required>Motivo de la cancelación</Label>
            <Textarea id="cr" name="reason" rows={3} required placeholder="Quién canceló y por qué" />
            {/* Obligatorio a propósito: un hueco en la agenda sin explicación no
                le sirve a nadie tres semanas después, cuando alguien pregunte
                por qué ese paciente no volvió. */}
            <p className="mt-1 text-xs text-muted-foreground">
              Queda en el historial de la cita. Sin motivo, el hueco en la agenda no se puede explicar después.
            </p>
          </div>

          <Submit label="Cancelar cita" variant="destructive" />
        </form>
      )}
    </div>
  );
}
