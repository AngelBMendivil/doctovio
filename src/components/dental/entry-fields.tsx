"use client";

import { useState } from "react";
import {
  FINDINGS,
  TREATMENTS,
  SURFACES,
  surfaceLabel,
  isWholeToothCode,
  toothName,
} from "@/lib/constants/odontograma";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/**
 * Captura de una anotación del odontograma: lo que se ENCONTRÓ o lo que se HIZO.
 *
 * Lo que se va a hacer no se registra aquí, sino en el plan de tratamiento:
 * ahí es donde vive su precio y su estado con el paciente.
 *
 * Los desplegables de esta pantalla solo eligen valores del formulario; nada se
 * guarda hasta que se presiona el botón. Un `select` que cambia datos al
 * soltarlo convierte un roce del mouse en una modificación del expediente.
 */
export function EntryFields({
  patientId,
  toothCode,
  consultationId,
}: {
  patientId: string;
  toothCode: string;
  consultationId?: string;
}) {
  const [kind, setKind] = useState<"FINDING" | "TREATMENT">("FINDING");
  const [code, setCode] = useState(FINDINGS[0].code);

  const opciones = kind === "FINDING" ? FINDINGS : TREATMENTS;
  const piezaCompleta = isWholeToothCode(code);
  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <>
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="toothCode" value={toothCode} />
      {consultationId && <input type="hidden" name="consultationId" value={consultationId} />}

      <div>
        <Label htmlFor="kind">Qué registro</Label>
        <Select
          id="kind"
          name="kind"
          value={kind}
          onChange={(e) => {
            const nuevo = e.target.value as "FINDING" | "TREATMENT";
            setKind(nuevo);
            setCode((nuevo === "FINDING" ? FINDINGS : TREATMENTS)[0].code);
          }}
        >
          <option value="FINDING">Hallazgo — lo que encontré</option>
          <option value="TREATMENT">Tratamiento realizado — lo que ya hice</option>
        </Select>
      </div>

      <div>
        <Label htmlFor="code">{kind === "FINDING" ? "Hallazgo" : "Tratamiento"}</Label>
        <Select id="code" name="code" value={code} onChange={(e) => setCode(e.target.value)}>
          {opciones.map((o) => (
            <option key={o.code} value={o.code}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="md:col-span-2">
        <Label>Superficies de la pieza {toothCode}</Label>
        {piezaCompleta ? (
          <p className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
            Esto aplica a la pieza completa, así que no lleva superficie.
          </p>
        ) : (
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {SURFACES.map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="surfaces" value={s} className="h-4 w-4" />
                {surfaceLabel(s, toothCode)}
              </label>
            ))}
          </div>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          {toothName(toothCode)}. Los nombres de las caras cambian según la pieza.
        </p>
      </div>

      <div>
        <Label htmlFor="recordedAt">Fecha</Label>
        <Input id="recordedAt" name="recordedAt" type="date" defaultValue={hoy} max={hoy} />
        <p className="mt-1 text-xs text-muted-foreground">Cuándo ocurrió, no cuándo se captura.</p>
      </div>

      <div className="md:col-span-2">
        <Label htmlFor="notes">Observaciones</Label>
        <Textarea id="notes" name="notes" rows={2} />
      </div>
    </>
  );
}
