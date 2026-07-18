"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generatePreRegLinkAction, type ActionState } from "@/lib/actions/preregistration";

function GenerateButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Generando..." : "Generar enlace de prerregistro"}
    </Button>
  );
}

export function GenerateLink() {
  const [state, formAction] = useFormState(generatePreRegLinkAction, null as ActionState);
  const [copied, setCopied] = useState(false);

  const url = state?.ok ? state.message : null;

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // silencioso: el usuario puede copiar manualmente
    }
  }

  return (
    <div className="space-y-3">
      <form action={formAction}>
        <GenerateButton />
      </form>

      {state && !state.ok && (
        <p className="text-sm text-red-700">{state.message}</p>
      )}

      {url && (
        <div className="rounded-md border border-border bg-muted/40 p-3">
          <p className="mb-2 text-sm font-medium">Comparte este enlace con el paciente:</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
            <Button type="button" variant="outline" onClick={copy}>
              {copied ? "¡Copiado!" : "Copiar"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">El enlace es válido por 7 días.</p>
        </div>
      )}
    </div>
  );
}
