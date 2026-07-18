"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Resultado de agendar a un paciente nuevo: su enlace de prerregistro.
 *
 * Se ofrece por WhatsApp (el camino principal: que lo llene en su casa, con
 * calma) y como QR para escanear en recepción si llegó sin llenarlo.
 */
export function PreRegLinkResult({
  url,
  patientName,
  phone,
}: {
  url: string;
  patientName: string;
  phone: string;
}) {
  const [copied, setCopied] = useState(false);

  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`;

  const waText = encodeURIComponent(
    `Hola ${patientName.split(" ")[0]}, tu cita quedó agendada. ` +
      `Para agilizar tu consulta, completa tu historia clínica aquí antes de venir: ${url}`
  );
  const waHref = `https://wa.me/${phone.replace(/\D/g, "")}?text=${waText}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* si el navegador lo bloquea, el paciente puede copiarlo del campo */
    }
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-start gap-2 rounded-xl border border-accent/30 bg-accent/5 px-3 py-2.5 text-navy">
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <span>
          <span className="font-semibold">Cita agendada.</span> Mándale el enlace para que llene su historia clínica
          antes de venir.
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <a href={waHref} target="_blank" rel="noopener noreferrer" className="flex-1">
          <Button type="button" variant="success" className="w-full">
            <MessageCircle className="h-4 w-4" />
            Enviar por WhatsApp
          </Button>
        </a>
        <Button type="button" variant="outline" onClick={copy}>
          <Copy className="h-4 w-4" />
          {copied ? "¡Copiado!" : "Copiar"}
        </Button>
      </div>

      <details className="rounded-xl border border-border">
        <summary className="cursor-pointer select-none px-3 py-2.5 text-[13px] font-medium text-primary">
          Mostrar QR para escanear en recepción
        </summary>
        <div className="border-t border-border p-4">
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrSrc} alt="QR de prerregistro" width={220} height={220} />
          </div>
          <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="mt-3 text-xs" />
        </div>
      </details>

      <p className="text-xs text-muted-foreground">
        El enlace deja de funcionar al terminar el día de la consulta. Al abrirlo, el paciente confirma su fecha de
        nacimiento antes de ver el formulario.
      </p>

      <Button type="button" variant="ghost" onClick={() => window.location.reload()} className="w-full">
        <RotateCcw className="h-4 w-4" />
        Agendar otra cita
      </Button>
    </div>
  );
}
