"use client";

import { useState } from "react";
import { SettingsForm } from "./settings-form";
import { Input } from "@/components/ui/input";
import { saveDoctorScheduleAction } from "@/lib/actions/schedule";

const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export type ScheduleRow = { weekday: number; startMinute: number; endMinute: number };

const toHHMM = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/**
 * Horario laboral del médico. Sin esto el asistente no puede ofrecer ningún
 * horario: es lo primero que consulta el motor de agenda.
 *
 * SOPORTA TURNO PARTIDO — dos rangos por día, mañana y tarde. No es un lujo:
 * el modelo siempre permitió varias filas por día y el alta de consultorio crea
 * 9-14 y 16-19 por defecto.
 *
 * Antes esta pantalla agrupaba con `new Map(rows.map(r => [r.weekday, r]))`,
 * que se queda con el ÚLTIMO rango de cada día. El médico abría Configuración,
 * veía solo su turno de la tarde, guardaba cualquier cosa y —como la acción
 * borra y reescribe— perdía la mañana sin ningún aviso. Sus pacientes dejaban
 * de poder agendar antes de las 4 y nadie sabía por qué.
 */
export function ScheduleEditor({ doctorId, rows }: { doctorId: string; rows: ScheduleRow[] }) {
  // Se conservan TODOS los rangos del día, ordenados por hora de inicio.
  const byDay = new Map<number, ScheduleRow[]>();
  for (const r of [...rows].sort((a, b) => a.startMinute - b.startMinute)) {
    byDay.set(r.weekday, [...(byDay.get(r.weekday) ?? []), r]);
  }

  const [active, setActive] = useState<Record<number, boolean>>(
    Object.fromEntries(DAYS.map((_, i) => [i, (byDay.get(i)?.length ?? 0) > 0]))
  );

  // Segundo turno abierto por día: arranca abierto si ya tenía uno guardado.
  const [split, setSplit] = useState<Record<number, boolean>>(
    Object.fromEntries(DAYS.map((_, i) => [i, (byDay.get(i)?.length ?? 0) > 1]))
  );

  return (
    <SettingsForm action={saveDoctorScheduleAction} submitLabel="Guardar horario" className="space-y-2">
      <input type="hidden" name="doctorId" value={doctorId} />

      {DAYS.map((day, i) => {
        const rangos = byDay.get(i) ?? [];
        const on = active[i];
        const partido = split[i];

        return (
          <div key={i} className="rounded-lg border border-border px-3 py-2">
            <div className="flex flex-wrap items-center gap-3">
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
                    defaultValue={rangos[0] ? toHHMM(rangos[0].startMinute) : "09:00"}
                    className="w-32"
                  />
                  <span className="text-sm text-muted-foreground">a</span>
                  <Input
                    type="time"
                    name={`end_${i}`}
                    defaultValue={rangos[0] ? toHHMM(rangos[0].endMinute) : "14:00"}
                    className="w-32"
                  />
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">No labora</span>
              )}

              {on && !partido && (
                <button
                  type="button"
                  onClick={() => setSplit((s) => ({ ...s, [i]: true }))}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  + Segundo turno
                </button>
              )}
            </div>

            {on && partido && (
              <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-border pt-2">
                <span className="w-32 shrink-0 text-sm text-muted-foreground">y también</span>
                <div className="flex items-center gap-2">
                  {/* El sufijo _2 es lo que la acción usa para distinguir el
                      segundo turno. Vaciar cualquiera de los dos campos elimina
                      ese turno al guardar. */}
                  <Input
                    type="time"
                    name={`start_${i}_2`}
                    defaultValue={rangos[1] ? toHHMM(rangos[1].startMinute) : "16:00"}
                    className="w-32"
                  />
                  <span className="text-sm text-muted-foreground">a</span>
                  <Input
                    type="time"
                    name={`end_${i}_2`}
                    defaultValue={rangos[1] ? toHHMM(rangos[1].endMinute) : "19:00"}
                    className="w-32"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setSplit((s) => ({ ...s, [i]: false }))}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  Quitar
                </button>
              </div>
            )}
          </div>
        );
      })}

      <p className="pt-1 text-xs text-muted-foreground">
        Usa el segundo turno para dejar la comida fuera de la agenda: con 9:00 a
        14:00 y 16:00 a 19:00, el asistente no ofrece citas entre las 2 y las 4.
      </p>
    </SettingsForm>
  );
}
