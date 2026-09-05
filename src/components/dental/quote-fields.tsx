"use client";

import { useState } from "react";
import { formatMoney, round2 } from "@/lib/utils/money";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type QuotableItem = {
  id: string;
  nombre: string;
  currency: string;
  toothCode: string | null;
  diagnosis: string | null;
  cantidad: number;
  precio: number;
  total: number;
  estado: string;
};

/**
 * Armado de la cotización: se eligen renglones del plan y se ven sumar.
 *
 * Solo aparecen los que todavía se pueden cotizar. Lo realizado y lo cancelado
 * se quedan fuera a propósito: cotizar algo que ya se hizo es la forma más
 * fácil de cobrarlo dos veces.
 */
export function QuoteFields({ patientId, items }: { patientId: string; items: QuotableItem[] }) {
  const [elegidos, setElegidos] = useState<string[]>(items.map((i) => i.id));
  const [extra, setExtra] = useState("0");

  const seleccionados = items.filter((i) => elegidos.includes(i.id));

  // Una cotización, una moneda: el servidor lo rechaza y aquí se avisa antes
  // de que la persona llene todo el formulario para nada.
  const monedas = [...new Set(seleccionados.map((i) => i.currency))];
  const mezclada = monedas.length > 1;
  const moneda = monedas[0] ?? "MXN";

  const subtotal = round2(seleccionados.reduce((s, i) => s + i.total, 0));
  const total = round2(Math.max(0, subtotal - (Number(extra) || 0)));

  const alternar = (id: string) =>
    setElegidos((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <>
      <input type="hidden" name="patientId" value={patientId} />

      <div className="md:col-span-2">
        <Label>Tratamientos a cotizar</Label>
        <div className="divide-y divide-border rounded-lg border border-border">
          {items.map((i) => (
            <label key={i.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted">
              <input
                type="checkbox"
                name="treatmentIds"
                value={i.id}
                checked={elegidos.includes(i.id)}
                onChange={() => alternar(i.id)}
                className="h-4 w-4"
              />
              <span className="flex-1">
                {i.toothCode && <strong className="mr-1">{i.toothCode}</strong>}
                {i.nombre}
                {i.diagnosis && <span className="text-muted-foreground"> · {i.diagnosis}</span>}
                {i.cantidad > 1 && <span className="text-muted-foreground"> · ×{i.cantidad}</span>}
              </span>
              <span className="tabular-nums">{formatMoney(i.total, i.currency)}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <Label htmlFor="validDays">Vigencia (días)</Label>
        <Input id="validDays" name="validDays" type="number" min={0} max={365} defaultValue={30} />
        <p className="mt-1 text-xs text-muted-foreground">0 = sin fecha límite.</p>
      </div>

      <div>
        <Label htmlFor="extraDiscount">Descuento adicional</Label>
        <Input
          id="extraDiscount"
          name="extraDiscount"
          inputMode="decimal"
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
        />
      </div>

      <div className="md:col-span-2">
        <Label htmlFor="notes">Observaciones</Label>
        <Textarea id="notes" name="notes" rows={2} />
      </div>

      <div className="md:col-span-2">
        <Label htmlFor="terms">Políticas y condiciones</Label>
        <Textarea
          id="terms"
          name="terms"
          rows={2}
          defaultValue="Presupuesto informativo. Los precios pueden cambiar si el diagnóstico cambia durante el tratamiento."
        />
      </div>

      <div className="rounded-lg border border-border bg-muted/50 px-4 py-3 md:col-span-2">
        <div className="flex items-center justify-between text-sm">
          <span>Subtotal ({elegidos.length} concepto{elegidos.length === 1 ? "" : "s"})</span>
          <span className="tabular-nums">{mezclada ? "—" : formatMoney(subtotal, moneda)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-base font-semibold">
          <span>Total estimado</span>
          <span className="tabular-nums">{mezclada ? "—" : formatMoney(total, moneda)}</span>
        </div>
        {mezclada && (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Elegiste tratamientos en {monedas.join(" y ")}. Una cotización lleva una sola moneda:
            genera una por cada una.
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Una cotización es un documento informativo: no es factura ni registra ningún pago.
        </p>
      </div>
    </>
  );
}
