"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export type ActionState = { ok: boolean; message: string } | null;

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Guardando..." : label}
    </Button>
  );
}

export function SettingsForm({
  action,
  submitLabel,
  className,
  children,
  resetOnSuccess = false,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  className?: string;
  children: ReactNode;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useFormState(action, null);
  const [dirty, setDirty] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (state?.ok) {
      setDirty(false);
      setShowModal(true);
      if (resetOnSuccess) setFormKey((k) => k + 1); // limpia el formulario (alta de usuario)
    }
  }, [state, resetOnSuccess]);

  // Aviso del navegador si hay cambios sin guardar y se intenta salir/recargar.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  return (
    <>
      <form
        key={formKey}
        action={formAction}
        onInput={() => setDirty(true)}
        className={className}
      >
        {children}

        {state && !state.ok && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 md:col-span-2">
            {state.message}
          </div>
        )}

        <div className="flex items-center gap-3 md:col-span-2">
          <SubmitButton label={submitLabel} />
          {dirty && <span className="text-xs font-medium text-amber-600">Cambios sin guardar</span>}
        </div>
      </form>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg bg-card p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center gap-2 text-lg font-semibold text-green-700">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-sm">✓</span>
              Actividad guardada
            </div>
            <p className="text-sm text-muted-foreground">
              {state?.message ?? "Los cambios se guardaron satisfactoriamente."}
            </p>
            <div className="mt-4 flex justify-end">
              <Button type="button" onClick={() => setShowModal(false)}>Aceptar</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
