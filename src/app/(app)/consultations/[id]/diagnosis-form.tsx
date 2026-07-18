"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { createDiagnosisAction, type ActionState } from "@/lib/actions/consultations";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending} className="md:col-span-4">
      {pending ? "Agregando..." : "Agregar diagnóstico"}
    </Button>
  );
}

/**
 * Alta de diagnóstico.
 *
 * Avisa mientras hay texto sin guardar: el error más común es escribirlo,
 * cambiar de pestaña y creer que quedó registrado. Al guardar bien, limpia el
 * formulario para poder agregar el siguiente.
 */
export function DiagnosisForm({ consultationId, patientId }: { consultationId: string; patientId: string }) {
  const [state, formAction] = useFormState(createDiagnosisAction, null as ActionState);
  const [dirty, setDirty] = useState(false);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      ref.current?.reset();
      setDirty(false);
    }
  }, [state]);

  return (
    <form
      ref={ref}
      action={formAction}
      onInput={() => setDirty(true)}
      className="grid grid-cols-1 gap-2 md:grid-cols-4"
    >
      <input type="hidden" name="consultationId" value={consultationId} />
      <input type="hidden" name="patientId" value={patientId} />

      <Input name="label" placeholder="Diagnóstico" required className="md:col-span-2" />
      <Select name="type" defaultValue="PRESUMPTIVE">
        <option value="PRESUMPTIVE">Presuntivo</option>
        <option value="CONFIRMED">Confirmado</option>
        <option value="DIFFERENTIAL">Diferencial</option>
        <option value="CHRONIC">Crónico</option>
        <option value="RESOLVED">Resuelto</option>
      </Select>
      <Input name="code" placeholder="Código (opcional)" />

      {state && !state.ok && (
        <div className="md:col-span-4">
          <Alert>{state.message}</Alert>
        </div>
      )}

      <Submit />

      <p className="md:col-span-4 text-xs text-muted-foreground">
        {dirty ? (
          <span className="font-medium text-amber-600">
            Sin guardar — presiona Agregar diagnóstico o se perderá.
          </span>
        ) : (
          <>
            Escribirlo no lo guarda: presiona <b>Agregar diagnóstico</b> para que quede en el expediente y salga en la
            receta.
          </>
        )}
      </p>
    </form>
  );
}
