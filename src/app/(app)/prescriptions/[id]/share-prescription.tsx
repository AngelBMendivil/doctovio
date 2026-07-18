"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function SharePrescription({ url, patientName, phone }: { url: string; patientName: string; phone: string | null }) {
  const [copied, setCopied] = useState(false);
  const msg = `Receta médica de ${patientName}: ${url}`;
  const digits = (phone ?? "").replace(/\D/g, "");
  const wa = digits ? `https://wa.me/52${digits}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
  const mail = `mailto:?subject=${encodeURIComponent("Tu receta médica")}&body=${encodeURIComponent(msg)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* copia manual */
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" size="sm" variant="outline" onClick={copy}>{copied ? "¡Copiado!" : "Copiar enlace"}</Button>
      <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90">WhatsApp</a>
      <a href={mail} className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-muted">Correo</a>
    </div>
  );
}
