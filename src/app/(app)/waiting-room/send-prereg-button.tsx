"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SendPreRegButton({
  url,
  patientName,
  phone,
}: {
  url: string;
  patientName: string;
  phone: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`;
  const msg = `Hola ${patientName}, para agilizar tu cita completa tu prerregistro aquí: ${url}`;
  const digits = (phone ?? "").replace(/\D/g, "");
  const wa = digits
    ? `https://wa.me/52${digits}?text=${encodeURIComponent(msg)}`
    : `https://wa.me/?text=${encodeURIComponent(msg)}`;
  const mail = `mailto:?subject=${encodeURIComponent("Prerregistro de tu cita")}&body=${encodeURIComponent(msg)}`;

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
    <>
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Enviar QR
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div className="my-8 w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Prerregistro de {patientName}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground">✕</button>
            </div>

            <div className="mb-3 flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR de prerregistro" width={200} height={200} />
            </div>

            <p className="mb-2 text-xs text-muted-foreground">Comparte el enlace con el paciente:</p>
            <div className="mb-3 flex gap-2">
              <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" variant="outline" onClick={copy}>{copied ? "¡Copiado!" : "Copiar"}</Button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                WhatsApp
              </a>
              <a
                href={mail}
                className="flex h-10 items-center justify-center gap-2 rounded-md border border-border text-sm font-medium hover:bg-muted"
              >
                Correo
              </a>
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              El enlace es válido por 7 días. Al completarlo, el estatus del paciente cambia a “prerregistro completo”.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
