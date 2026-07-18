"use client";

import { useState } from "react";
import { SettingsForm } from "./settings-form";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { saveDoctorScheduleAction } from "@/lib/actions/schedule";

const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export type ScheduleRow = { weekday: number; startMinute: number; endMinute: number };

const toHHMM = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/**
 * Horario laboral del médico. Sin esto el asistente no puede ofrecer ningún
 * horario: es lo primero que consulta el motor de agenda.
 */
export function ScheduleEditor({ doctorId, rows }: { doctorId: string; rows: ScheduleRow[] }) {
  const byDay = new Map(rows.map((r) => [r.weekday, r]));
  const [active, setActive] = useState<Record<number, boolean>>(
    Object.fromEntries(DAYS.map((_, i) => [i, byDay.has(i)]))
  );

  return (
    <SettingsForm action={saveDoctorScheduleAction} submitLabel="Guardar horario" className="space-y-2">
      <input type="hidden" name="doctorId" value={doctorId} />

      {DAYS.map((day, i) => {
        const row = byDay.get(i);
        const on = active[i];
        return (
          <div key={i} className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2">
            <label className="flex w-32 shrink-0 items-center gap-2 text-sm">
              <input
                type="checkbox"
                name={`active_${i}`}
                checked={on}
                onChange={(e) => setActive((a) => ({ ...a, [i]: e.target.checked }))}
              />
              <span className={on ? "font-medium text-navy" : "text-muted-foreground"}>{day}</span>
            </label>

            {on ? (
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  name={`start_${i}`}
                  defaultValue={row ? toHHMM(row.startMinute) : "09:00"}
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">a</span>
                <Input
                  type="time"
                  name={`end_${i}`}
                  defaultValue={row ? toHHMM(row.endMinute) : "18:00"}
                  className="w-32"
                />
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">No labora</span>
            )}
          </div>
        );
      })}

      <p className="pt-1 text-xs text-muted-foreground">
        El asistente solo ofrece horarios dentro de este rango, descontando citas, bloqueos y la anticipación mínima
        configurada en la pestaña General.
      </p>
    </SettingsForm>
  );
}
