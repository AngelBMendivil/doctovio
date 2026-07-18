"use client";

import { Select } from "@/components/ui/select";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

/** Selector de hora en formato 24h con minutos de 5 en 5. Emite `hour` y `minute`. */
export function TimeSelect({
  defaultHour = "09",
  defaultMinute = "00",
}: {
  defaultHour?: string;
  defaultMinute?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Select name="hour" defaultValue={defaultHour} aria-label="Hora">
        {HOURS.map((h) => (
          <option key={h} value={h}>{h} h</option>
        ))}
      </Select>
      <Select name="minute" defaultValue={defaultMinute} aria-label="Minuto">
        {MINUTES.map((m) => (
          <option key={m} value={m}>{m} min</option>
        ))}
      </Select>
    </div>
  );
}
