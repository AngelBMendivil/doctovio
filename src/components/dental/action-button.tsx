"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

type ActionState = { ok: boolean; message: string } | null;

function Submit({
  label,
  variant,
  confirmar,
}: {
  label: string;
  variant?: "primary" | "success" | "secondary" | "outline" | "ghost" | "destructive";
  confirmar?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      variant={variant ?? "outline"}
      disabled={pending}
      onClick={(e) => {
        // Las acciones que no se deshacen preguntan antes. Marcar un
        // tratamiento como realizado escribe en el expediente clínico.
        if (confirmar && !window.confirm(confirmar)) e.preventDefault();
      }}
    >
      {pending ? "..." : label}
    </Button>
  );
}

/**
 * Botón de una acción sobre un renglón: cambiar estado, marcar realizado.
 *
 * Es un FORMULARIO con su botón, no un `select` que actúa al cambiar. La
 * diferencia importa: un desplegable que guarda al soltarlo convierte un roce
 * del mouse o de la rueda en una modificación del expediente, y nadie se entera
 * hasta que ya está guardada.
 */
export function ActionButton({
  action,
  fields,
  label,
  variant,
  confirmar,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  label: string;
  variant?: "primary" | "success" | "secondary" | "outline" | "ghost" | "destructive";
  confirmar?: string;
}) {
  const [state, formAction] = useFormState(action, null);

  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-1">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Submit label={label} variant={variant} confirmar={confirmar} />
      {state && !state.ok && <span className="text-xs text-red-600">{state.message}</span>}
    </form>
  );
}
