"use client";

import { useState } from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { TimeSelect } from "@/app/(app)/appointments/time-select";
import { createPaymentAction, scheduleFollowUpAction, type ActionState } from "@/lib/actions/billing";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Guardando..." : label}</Button>;
}

export function PaymentFlow({
  consultationId,
  patientId,
  doctorId,
  patientName,
  basePriceMxn,
  basePriceUsd,
  defaultCurrency,
  defaultDate,
  insurers,
  patientInsurerId,
}: {
  consultationId: string;
  patientId: string;
  doctorId: string;
  patientName: string;
  basePriceMxn: number | null;
  basePriceUsd: number | null;
  defaultCurrency: string;
  defaultDate: string;
  insurers: { id: string; name: string }[];
  patientInsurerId: string | null;
}) {
  const [payState, payAction] = useFormState(createPaymentAction, null as ActionState);
  const [followState, followAction] = useFormState(scheduleFollowUpAction, null as ActionState);

  // Moneda y monto iniciales: los de la configuración del consultorio.
  const initialCurrency: "MXN" | "USD" = defaultCurrency === "USD" ? "USD" : "MXN";
  const initialBase = initialCurrency === "USD" ? basePriceUsd : basePriceMxn;

  const [currency, setCurrency] = useState<"MXN" | "USD">(initialCurrency);
  const [amount, setAmount] = useState<string>(initialBase != null ? String(initialBase) : "");
  const [method, setMethod] = useState("CASH");
  const [wantsNext, setWantsNext] = useState(false);

  // Origen: si el paciente tiene póliza activa se sugiere Aseguranza, pero es editable.
  const [origin, setOrigin] = useState<"PRIVATE" | "INSURANCE">(patientInsurerId ? "INSURANCE" : "PRIVATE");
  const [insurerId, setInsurerId] = useState(patientInsurerId ?? "");

  const base = currency === "USD" ? basePriceUsd : basePriceMxn;

  function onCurrency(c: "MXN" | "USD") {
    setCurrency(c);
    const next = c === "USD" ? basePriceUsd : basePriceMxn;
    setAmount(next != null ? String(next) : "");
  }

  // Paso 2: pago realizado
  if (payState?.ok) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
          ✓ Pago registrado. El paciente sale de “Por pagar”.
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <p className="font-medium">¿Próxima cita?</p>
          <div className="mt-2">
            <Select value={wantsNext ? "si" : "no"} onChange={(e) => setWantsNext(e.target.value === "si")} className="w-40">
              <option value="no">N/A — Sin cita</option>
              <option value="si">Sí, agendar</option>
            </Select>
          </div>

          {wantsNext && !followState?.ok && (
            <form action={followAction} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <input type="hidden" name="patientId" value={patientId} />
              <input type="hidden" name="doctorId" value={doctorId} />
              <div>
                <Label>Fecha</Label>
                <Input name="scheduledDate" type="date" defaultValue={defaultDate} required />
              </div>
              <div>
                <Label>Hora</Label>
                <TimeSelect />
              </div>
              <div className="md:col-span-2">
                <Label>Tipo de cita</Label>
                <Select name="reason" defaultValue="Seguimiento">
                  <option value="Seguimiento">Seguimiento</option>
                  <option value="Revisión de resultados">Revisión de resultados</option>
                  <option value="Control">Control</option>
                  <option value="Otro">Otro</option>
                </Select>
              </div>
              {followState && !followState.ok && (
                <p className="text-sm text-red-700 md:col-span-2">{followState.message}</p>
              )}
              <div className="md:col-span-2">
                <Submit label="Agendar próxima cita" />
              </div>
            </form>
          )}

          {followState?.ok && (
            <p className="mt-3 text-sm text-green-700">✓ {followState.message}</p>
          )}

          <div className="mt-4">
            <Link href="/payments" className="text-sm text-primary hover:underline">← Volver a Por pagar</Link>
          </div>
        </div>
      </div>
    );
  }

  // Paso 1: registrar pago
  return (
    <form action={payAction} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <input type="hidden" name="consultationId" value={consultationId} />
      <input type="hidden" name="patientId" value={patientId} />

      <div>
        <Label>Moneda</Label>
        <Select name="currency" value={currency} onChange={(e) => onCurrency(e.target.value as "MXN" | "USD")}>
          <option value="MXN">MXN</option>
          <option value="USD">USD</option>
        </Select>
      </div>
      <div>
        <Label>Monto ({currency})</Label>
        <Input name="amount" type="number" step="0.01" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} required />
        {base != null ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Precio base de consulta: {base} {currency} · puedes ajustarlo si este cobro es distinto.
          </p>
        ) : (
          <p className="mt-1 text-xs text-amber-600">
            No hay precio base en {currency}.{" "}
            <Link href="/settings" className="underline hover:text-amber-700">Configúralo en Configuración → General</Link>{" "}
            para que se llene solo.
          </p>
        )}
      </div>
      <div>
        <Label>Origen</Label>
        <Select name="origin" value={origin} onChange={(e) => setOrigin(e.target.value as "PRIVATE" | "INSURANCE")}>
          <option value="PRIVATE">Privado</option>
          <option value="INSURANCE">Aseguranza</option>
        </Select>
        {patientInsurerId && origin === "PRIVATE" && (
          <p className="mt-1 text-xs text-amber-600">Este paciente tiene póliza registrada.</p>
        )}
      </div>
      {origin === "INSURANCE" && (
        <div>
          <Label>Aseguradora</Label>
          <Select name="insurerId" value={insurerId} onChange={(e) => setInsurerId(e.target.value)} required>
            <option value="">Selecciona…</option>
            {insurers.map((i) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </Select>
          {insurers.length === 0 && (
            <p className="mt-1 text-xs text-amber-600">
              No hay aseguradoras.{" "}
              <Link href="/insurers" className="underline hover:text-amber-700">Da de alta el catálogo</Link>.
            </p>
          )}
        </div>
      )}
      <div>
        <Label>Método de pago</Label>
        <Select name="method" value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="CASH">Efectivo</option>
          <option value="TRANSFER">Transferencia</option>
          <option value="CARD">Tarjeta</option>
          <option value="OTHER">Otro</option>
        </Select>
      </div>
      {method === "TRANSFER" && (
        <div>
          <Label>Referencia de transferencia</Label>
          <Input name="reference" placeholder="No. de referencia / banco" />
        </div>
      )}
      <div className="md:col-span-2">
        <Label>Notas (opcional)</Label>
        <Textarea name="notes" rows={2} />
      </div>

      {payState && !payState.ok && (
        <p className="text-sm text-red-700 md:col-span-2">{payState.message}</p>
      )}

      <div className="md:col-span-2">
        <Submit label={`Registrar pago (${patientName})`} />
      </div>
    </form>
  );
}
