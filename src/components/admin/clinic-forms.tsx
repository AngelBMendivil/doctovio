"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AlertTriangle } from "lucide-react";
import {
  setClinicStatusAction,
  updateClinicPlanAction,
  registerPaymentAction,
  type PlatformState,
} from "@/lib/actions/platform";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import type { ClinicStatus, ClinicType } from "@prisma/client";

/**
 * Formularios del detalle de consultorio.
 *
 * React 18: `useFormState` y `useFormStatus` de react-dom. `useActionState` no
 * existe en esta versión.
 */

const initial: PlatformState = {};

function Submit({ children, variant = "primary" }: { children: React.ReactNode; variant?: "primary" | "secondary" | "destructive" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? "Guardando..." : children}
    </Button>
  );
}

function Mensaje({ state }: { state: PlatformState }) {
  if (state.error) return <Alert>{state.error}</Alert>;
  if (state.ok) return <Alert tone="success">{state.ok}</Alert>;
  return null;
}

const ESTADOS: { value: ClinicStatus; label: string; corta: boolean }[] = [
  { value: "TRIAL", label: "En prueba — con acceso", corta: false },
  { value: "ACTIVE", label: "Activo — con acceso", corta: false },
  { value: "SUSPENDED", label: "Suspendido — sin acceso", corta: true },
  { value: "CANCELLED", label: "Cancelado — sin acceso", corta: true },
];

/** Lo que se le advierte al Master antes de cortarle el acceso a alguien. */
const AVISO: Partial<Record<ClinicStatus, string>> = {
  SUSPENDED:
    "Estás por suspender este consultorio. Los usuarios perderán temporalmente el acceso y dejarán de salir sus recordatorios por WhatsApp, pero ninguna información será eliminada. Puede reactivarse en cualquier momento.",
  CANCELLED:
    "Estás por cancelar este consultorio. Los usuarios perderán el acceso y se dejarán de generar mensualidades. Toda la información y el historial comercial se conservan, y administrativamente puede reactivarse.",
};

/**
 * Cambio de estado.
 *
 * Pide confirmación explícita cuando la acción CORTA el acceso. Suspender es lo
 * único aquí que deja a un consultorio real sin poder trabajar, y el aviso de
 * que no se borra nada va a la vista: es la primera duda que salta, y
 * tratándose de expedientes clínicos importa.
 */
export function EstadoForm({ organizationId, status }: { organizationId: string; status: ClinicStatus }) {
  const [state, action] = useFormState(setClinicStatusAction, initial);
  const [elegido, setElegido] = useState<ClinicStatus>(status);

  const corta = ESTADOS.find((e) => e.value === elegido)?.corta ?? false;
  const cambio = elegido !== status;
  const aviso = corta && cambio ? AVISO[elegido] : null;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="organizationId" value={organizationId} />

      <div className="space-y-1.5">
        <Label htmlFor="status">Estado</Label>
        <Select
          id="status"
          name="status"
          value={elegido}
          onChange={(e) => setElegido(e.target.value as ClinicStatus)}
        >
          {ESTADOS.map((e) => (
            <option key={e.value} value={e.value}>
              {e.label}
            </option>
          ))}
        </Select>
      </div>

      {aviso ? (
        <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-amber-900">{aviso}</p>
            <label className="flex items-center gap-2 text-sm font-medium text-amber-900">
              <input type="checkbox" name="confirmado" required className="h-4 w-4 rounded border-amber-300" />
              Entiendo y quiero continuar
            </label>
          </div>
        </div>
      ) : (
        <p className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-navy">Nada se borra nunca.</span> Pacientes,
          expedientes, citas, recetas e historial se conservan completos en cualquier
          estado, y al reactivar todo vuelve como estaba.
        </p>
      )}

      <Mensaje state={state} />
      <Submit variant={corta && cambio ? "destructive" : "primary"}>
        {cambio ? "Cambiar estado" : "Guardar"}
      </Submit>
    </form>
  );
}

// ---------------------------------------------------------------------------

export function PlanForm({
  organizationId,
  type,
  maxUsers,
  planName,
  monthlyFeeMxn,
}: {
  organizationId: string;
  type: ClinicType;
  maxUsers: number;
  planName: string | null;
  monthlyFeeMxn: number | null;
}) {
  const [state, action] = useFormState(updateClinicPlanAction, initial);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="organizationId" value={organizationId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="type">Tipo de consultorio</Label>
          <Select id="type" name="type" defaultValue={type}>
            <option value="MEDICAL">Médico</option>
            <option value="DENTAL">Dental</option>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="maxUsers">Tope de usuarios</Label>
          <Input id="maxUsers" name="maxUsers" type="number" min={1} defaultValue={maxUsers} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="planName">Etiqueta del plan</Label>
          <Input id="planName" name="planName" defaultValue={planName ?? ""} placeholder="Básico, Completo…" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="monthlyFeeMxn">Cuota heredada (MXN)</Label>
          <Input
            id="monthlyFeeMxn"
            name="monthlyFeeMxn"
            type="number"
            min={0}
            step="0.01"
            defaultValue={monthlyFeeMxn ?? ""}
            placeholder="Sin definir"
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        El precio que se cobra sale de la <span className="font-medium text-navy">suscripción</span>,
        no de este campo. La cuota en pesos se conserva de antes del catálogo y ya no manda.
      </p>

      <Mensaje state={state} />
      <Submit variant="secondary">Guardar plan</Submit>
    </form>
  );
}

// ---------------------------------------------------------------------------

/**
 * Pago suelto, sin mensualidad de por medio.
 *
 * Lo normal es registrar contra una mensualidad desde Cobranza, que es lo que
 * mueve el estado del ciclo. Esto queda para casos fuera de esa vía.
 */
export function PagoForm({
  organizationId,
  sugerido,
}: {
  organizationId: string;
  sugerido: { periodStart: string; periodEnd: string; hoy: string; amount: number | null };
}) {
  const [state, action] = useFormState(registerPaymentAction, initial);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="organizationId" value={organizationId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="amount">Monto</Label>
          <Input id="amount" name="amount" type="number" min={0} step="0.01" defaultValue={sugerido.amount ?? ""} required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="method">Forma de pago</Label>
          <Select id="method" name="method" defaultValue="TRANSFER">
            <option value="TRANSFER">Transferencia</option>
            <option value="CASH">Efectivo</option>
            <option value="CARD">Tarjeta</option>
            <option value="OTHER">Otra</option>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="periodStart">Periodo desde</Label>
          <Input id="periodStart" name="periodStart" type="date" defaultValue={sugerido.periodStart} required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="periodEnd">Periodo hasta</Label>
          <Input id="periodEnd" name="periodEnd" type="date" defaultValue={sugerido.periodEnd} required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="paidAt">Fecha de pago</Label>
          <Input id="paidAt" name="paidAt" type="date" defaultValue={sugerido.hoy} required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reference">Referencia</Label>
          <Input id="reference" name="reference" placeholder="Folio de la transferencia" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notas</Label>
        <Textarea id="notes" name="notes" rows={2} />
      </div>

      <Mensaje state={state} />
      <Submit>Registrar pago</Submit>
    </form>
  );
}
