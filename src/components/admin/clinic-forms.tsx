"use client";

import { useFormState, useFormStatus } from "react-dom";
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
 * Formularios del panel de plataforma.
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

// ---------------------------------------------------------------------------

/**
 * Cambio de estado.
 *
 * Suspender es lo único aquí que le corta el acceso a un consultorio real, así
 * que el aviso de que no se borra nada está a la vista: es la primera duda que
 * salta al hacerlo, y tratándose de expedientes clínicos importa.
 */
export function EstadoForm({ organizationId, status }: { organizationId: string; status: ClinicStatus }) {
  const [state, action] = useFormState(setClinicStatusAction, initial);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="organizationId" value={organizationId} />

      <div className="space-y-1.5">
        <Label htmlFor="status">Estado</Label>
        <Select id="status" name="status" defaultValue={status}>
          <option value="TRIAL">En prueba</option>
          <option value="ACTIVE">Activo</option>
          <option value="SUSPENDED">Suspendido — sin acceso</option>
          <option value="CANCELLED">Cancelado — sin acceso</option>
        </Select>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Suspender corta el acceso de inmediato, incluidos los recordatorios por
        WhatsApp. <span className="font-medium text-navy">No se borra nada:</span>{" "}
        pacientes, expedientes, citas e historial quedan completos y al reactivar
        todo vuelve como estaba.
      </p>

      <Mensaje state={state} />
      <Submit>Cambiar estado</Submit>
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
          <Label htmlFor="type">Giro</Label>
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
          <Label htmlFor="planName">Plan</Label>
          <Input id="planName" name="planName" defaultValue={planName ?? ""} placeholder="Básico, Completo…" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="monthlyFeeMxn">Cuota mensual (MXN)</Label>
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

      <Mensaje state={state} />
      <Submit variant="secondary">Guardar plan</Submit>
    </form>
  );
}

// ---------------------------------------------------------------------------

/**
 * Registro de un pago recibido.
 *
 * La captura es manual a propósito: el operador recibe la transferencia y la
 * anota. `periodEnd` es lo que mueve la fecha de cobertura del consultorio.
 */
export function PagoForm({ organizationId, sugerido }: { organizationId: string; sugerido: { periodStart: string; periodEnd: string; hoy: string; amount: number | null } }) {
  const [state, action] = useFormState(registerPaymentAction, initial);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="organizationId" value={organizationId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="amount">Monto (MXN)</Label>
          <Input
            id="amount"
            name="amount"
            type="number"
            min={0}
            step="0.01"
            defaultValue={sugerido.amount ?? ""}
            required
          />
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

      <p className="text-xs text-muted-foreground">
        La cobertura del consultorio avanza hasta la fecha de{" "}
        <span className="font-medium text-navy">Periodo hasta</span>. Registrar
        un pago de un periodo anterior no la retrocede.
      </p>

      <Mensaje state={state} />
      <Submit>Registrar pago</Submit>
    </form>
  );
}
