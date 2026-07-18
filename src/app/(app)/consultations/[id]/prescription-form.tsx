"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { issuePrescriptionAction } from "@/lib/actions/prescriptions";

const ROUTES = [
  "Oral", "Sublingual", "Intramuscular", "Intravenosa", "Subcutánea", "Tópica",
  "Oftálmica", "Ótica", "Nasal", "Inhalada", "Rectal", "Vaginal", "Transdérmica",
];
const DURATIONS = ["3 días", "5 días", "7 días", "10 días", "14 días", "21 días", "1 mes", "3 meses", "6 meses", "Indefinida"];
const MAX = 10;

export function PrescriptionForm({ patientId, consultationId }: { patientId: string; consultationId: string }) {
  const [count, setCount] = useState(1);

  return (
    <form action={issuePrescriptionAction} className="space-y-3">
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="consultationId" value={consultationId} />
      <datalist id="duracionOptions">
        {DURATIONS.map((d) => <option key={d} value={d} />)}
      </datalist>

      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="grid grid-cols-2 gap-2 rounded-md border border-border p-2 md:grid-cols-5">
          <div className="col-span-2 flex items-center justify-between md:col-span-5">
            <span className="text-xs font-medium text-muted-foreground">Medicamento {i + 1}</span>
            {count > 1 && (
              <button
                type="button"
                onClick={() => setCount((c) => c - 1)}
                className="text-xs text-red-600 hover:underline"
              >
                Quitar último
              </button>
            )}
          </div>
          <Input name={`item_${i}_medicationName`} placeholder="Medicamento" className="md:col-span-2" />
          <Input name={`item_${i}_activeIngredient`} placeholder="Principio activo" />
          <Input name={`item_${i}_presentation`} placeholder="Presentación (cápsulas 20 mg)" />
          <Input name={`item_${i}_quantityToDispense`} placeholder="Cantidad a surtir (1 caja/30 tabs)" />
          <Input name={`item_${i}_dose`} placeholder="Dosis" />
          <Input name={`item_${i}_frequency`} placeholder="Frecuencia" />
          <Select name={`item_${i}_route`} defaultValue="">
            <option value="">Vía…</option>
            {ROUTES.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
          <Input name={`item_${i}_duration`} placeholder="Duración (días o indefinida)" list="duracionOptions" />
          <Textarea
            name={`item_${i}_instructions`}
            rows={2}
            placeholder="Instrucciones de uso (ej. tomar con alimentos, no manejar, etc.)"
            className="md:col-span-5"
          />
        </div>
      ))}

      {count < MAX && (
        <Button type="button" variant="outline" size="sm" onClick={() => setCount((c) => Math.min(c + 1, MAX))}>
          + Agregar otro medicamento
        </Button>
      )}

      <Textarea name="instructions" placeholder="Indicaciones generales" />
      <Textarea name="recommendations" placeholder="Recomendaciones" />
      <Button type="submit" size="sm">Emitir receta</Button>
    </form>
  );
}
