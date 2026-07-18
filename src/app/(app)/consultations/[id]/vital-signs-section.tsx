"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { recordVitalSignsAction, type ActionState } from "@/lib/actions/consultations";

type VitalSigns = {
  weightKg: number | null;
  heightCm: number | null;
  bmi: number | null;
  temperatureC: number | null;
  systolicPressure: number | null;
  diastolicPressure: number | null;
  heartRate: number | null;
  respiratoryRate: number | null;
  oxygenSaturation: number | null;
  glucose: number | null;
  painScale: number | null;
} | null;

const v = (n: number | null) => (n === null || n === undefined ? "—" : n);
const d = (n: number | null) => (n === null || n === undefined ? "" : n);

export function VitalSignsSection({
  consultationId,
  patientId,
  current,
  canEdit,
  locked,
}: {
  consultationId: string;
  patientId: string;
  current: VitalSigns;
  canEdit: boolean;
  locked: boolean;
}) {
  const [editing, setEditing] = useState(false);
  // Escribir no es guardar. Sin este aviso, el médico captura, cambia de
  // pestaña, la página se refresca y cree que el sistema le borró los datos.
  const [dirty, setDirty] = useState(false);
  const [state, formAction] = useFormState(recordVitalSignsAction, null as ActionState);

  // Al guardar bien, se sale del modo edición y se limpia el aviso.
  useEffect(() => {
    if (state?.ok) {
      setDirty(false);
      setEditing(false);
    }
  }, [state]);

  // Ya capturados y no se está editando -> solo lectura.
  if (current && !editing) {
    return (
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <p className="text-sm font-medium">Signos vitales</p>
          {canEdit && (
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
              Editar
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
          <p><b>Peso:</b> {v(current.weightKg)} kg</p>
          <p><b>Talla:</b> {v(current.heightCm)} cm</p>
          <p><b>IMC:</b> {v(current.bmi)}</p>
          <p><b>Temp:</b> {v(current.temperatureC)} °C</p>
          <p><b>TA:</b> {v(current.systolicPressure)}/{v(current.diastolicPressure)}</p>
          <p><b>FC:</b> {v(current.heartRate)}</p>
          <p><b>FR:</b> {v(current.respiratoryRate)}</p>
          <p><b>SpO2:</b> {v(current.oxygenSaturation)}%</p>
          <p><b>Glucosa:</b> {v(current.glucose)}</p>
          <p><b>Dolor:</b> {v(current.painScale)}/10</p>
        </div>
      </div>
    );
  }

  // Sin signos y consulta bloqueada -> nada que capturar.
  if (!current && locked) {
    return <p className="text-sm text-muted-foreground">Sin signos vitales registrados.</p>;
  }

  // Captura o edición.
  return (
    <form action={formAction} onInput={() => setDirty(true)} className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <input type="hidden" name="consultationId" value={consultationId} />
      <input type="hidden" name="patientId" value={patientId} />
      <div><Label>Peso (kg)</Label><Input name="weightKg" type="number" step="0.1" defaultValue={d(current?.weightKg ?? null)} /></div>
      <div><Label>Talla (cm)</Label><Input name="heightCm" type="number" step="0.1" defaultValue={d(current?.heightCm ?? null)} /></div>
      <div><Label>Temp (°C)</Label><Input name="temperatureC" type="number" step="0.1" defaultValue={d(current?.temperatureC ?? null)} /></div>
      <div><Label>TA sistólica</Label><Input name="systolicPressure" type="number" defaultValue={d(current?.systolicPressure ?? null)} /></div>
      <div><Label>TA diastólica</Label><Input name="diastolicPressure" type="number" defaultValue={d(current?.diastolicPressure ?? null)} /></div>
      <div><Label>Frec. cardiaca</Label><Input name="heartRate" type="number" defaultValue={d(current?.heartRate ?? null)} /></div>
      <div><Label>Frec. respiratoria</Label><Input name="respiratoryRate" type="number" defaultValue={d(current?.respiratoryRate ?? null)} /></div>
      <div><Label>SpO2 (%)</Label><Input name="oxygenSaturation" type="number" defaultValue={d(current?.oxygenSaturation ?? null)} /></div>
      <div><Label>Glucosa</Label><Input name="glucose" type="number" step="0.1" defaultValue={d(current?.glucose ?? null)} /></div>
      <div><Label>Escala de dolor (0-10)</Label><Input name="painScale" type="number" min={0} max={10} defaultValue={d(current?.painScale ?? null)} /></div>
      {/* Los valores capturados NO se pierden: el error se muestra y el
          formulario conserva lo que el médico escribió. */}
      {state && !state.ok && (
        <div className="col-span-2 md:col-span-4">
          <Alert>{state.message}</Alert>
        </div>
      )}

      <div className="col-span-2 flex flex-wrap items-end gap-2 md:col-span-4">
        <Button type="submit" size="sm">{current ? "Guardar cambios" : "Capturar signos vitales"}</Button>
        {current && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
        )}
        {dirty && (
          <span className="text-xs font-medium text-amber-600">
            Sin guardar — presiona {current ? "Guardar cambios" : "Capturar signos vitales"}
          </span>
        )}
      </div>
    </form>
  );
}
