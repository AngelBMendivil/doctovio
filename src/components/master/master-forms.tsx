"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  createProductAction,
  updateProductAction,
  generateCyclesAction,
  registerCyclePaymentAction,
  waiveCycleAction,
  createUserAction,
  setUserActiveAction,
  changeUserRoleAction,
  moveUserAction,
  type MasterState,
} from "@/lib/actions/master";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";

/** React 18: useFormState / useFormStatus. `useActionState` no existe aquí. */
const initial: MasterState = {};

function Submit({ children, variant = "primary", size }: { children: React.ReactNode; variant?: "primary" | "secondary" | "outline" | "ghost"; size?: "sm" | "md" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending}>
      {pending ? "..." : children}
    </Button>
  );
}

function Msg({ state }: { state: MasterState }) {
  if (state.error) return <Alert className="mt-3">{state.error}</Alert>;
  if (state.ok) return <Alert tone="success" className="mt-3">{state.ok}</Alert>;
  return null;
}

// ------------------------------------------------------------------ PRODUCTOS

export function ProductForm({ product }: { product?: { id: string; code: string; name: string; description: string | null; price: number; currency: string; billingFrequency: string; isActive: boolean } }) {
  const editar = Boolean(product);
  const [state, action] = useFormState(editar ? updateProductAction : createProductAction, initial);

  return (
    <form action={action} className="space-y-4">
      {product && <input type="hidden" name="id" value={product.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        {!editar && (
          <div className="space-y-1.5">
            <Label htmlFor="code">Código</Label>
            <Input id="code" name="code" placeholder="DOCTOVIO_PRO" required />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="name">Nombre</Label>
          <Input id="name" name="name" defaultValue={product?.name} required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="price">Precio</Label>
          <Input id="price" name="price" type="number" min={0} step="0.01" defaultValue={product?.price} required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="currency">Moneda</Label>
          <Select id="currency" name="currency" defaultValue={product?.currency ?? "USD"}>
            <option value="USD">USD</option>
            <option value="MXN">MXN</option>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="billingFrequency">Periodicidad</Label>
          <Select id="billingFrequency" name="billingFrequency" defaultValue={product?.billingFrequency ?? "MONTHLY"}>
            <option value="MONTHLY">Mensual</option>
            <option value="YEARLY">Anual</option>
          </Select>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="description">Descripción</Label>
          <Input id="description" name="description" defaultValue={product?.description ?? ""} />
        </div>
      </div>

      {editar && (
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" name="isActive" defaultChecked={product?.isActive} className="h-4 w-4 rounded border-border" />
          Activo en el catálogo
        </label>
      )}

      {editar && (
        <p className="text-xs text-muted-foreground">
          Cambiar el precio afecta solo a contrataciones futuras. Las suscripciones
          vigentes y las mensualidades ya emitidas conservan el suyo.
        </p>
      )}

      <Msg state={state} />
      <Submit variant={editar ? "secondary" : "primary"}>{editar ? "Guardar" : "Crear producto"}</Submit>
    </form>
  );
}

// ------------------------------------------------------------------ COBRANZA

export function GenerateCyclesForm({ period }: { period: string }) {
  const [state, action] = useFormState(generateCyclesAction, initial);

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="period">Periodo</Label>
        <Input id="period" name="period" defaultValue={period} placeholder="2026-09" className="w-36" />
      </div>
      <Submit variant="secondary">Generar mensualidades</Submit>
      <p className="w-full text-xs text-muted-foreground">
        Se puede correr las veces que quieras: no duplica cobros.
      </p>
      <div className="w-full">
        <Msg state={state} />
      </div>
    </form>
  );
}

export function CyclePaymentForm({ cycleId, saldo, hoy }: { cycleId: string; saldo: number; hoy: string }) {
  const [state, action] = useFormState(registerCyclePaymentAction, initial);
  const [abierto, setAbierto] = useState(false);

  if (!abierto) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setAbierto(true)}>
        Registrar pago
      </Button>
    );
  }

  return (
    <form action={action} className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
      <input type="hidden" name="billingCycleId" value={cycleId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`amount-${cycleId}`}>Monto</Label>
          <Input id={`amount-${cycleId}`} name="amount" type="number" min={0} step="0.01" defaultValue={saldo} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`paidAt-${cycleId}`}>Fecha de pago</Label>
          <Input id={`paidAt-${cycleId}`} name="paidAt" type="date" defaultValue={hoy} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`method-${cycleId}`}>Forma</Label>
          <Select id={`method-${cycleId}`} name="method" defaultValue="TRANSFER">
            <option value="TRANSFER">Transferencia</option>
            <option value="CASH">Efectivo</option>
            <option value="CARD">Tarjeta</option>
            <option value="OTHER">Otra</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`reference-${cycleId}`}>Referencia</Label>
          <Input id={`reference-${cycleId}`} name="reference" />
        </div>
      </div>

      <Msg state={state} />
      <div className="flex gap-2">
        <Submit size="sm">Guardar</Submit>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export function WaiveCycleForm({ cycleId }: { cycleId: string }) {
  const [state, action] = useFormState(waiveCycleAction, initial);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="billingCycleId" value={cycleId} />
      <Submit variant="ghost" size="sm">Condonar</Submit>
      <Msg state={state} />
    </form>
  );
}

// ------------------------------------------------------------------ USUARIOS

type ClinicOption = { id: string; name: string };

export function CreateUserForm({ clinics }: { clinics: ClinicOption[] }) {
  const [state, action] = useFormState(createUserAction, initial);

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="fullName">Nombre completo</Label>
          <Input id="fullName" name="fullName" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Correo</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Contraseña temporal</Label>
          <Input id="password" name="password" type="password" minLength={8} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Teléfono</Label>
          <Input id="phone" name="phone" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="organizationId">Consultorio</Label>
          <Select id="organizationId" name="organizationId" required>
            {clinics.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="role">Rol</Label>
          <Select id="role" name="role" defaultValue="ASSISTANT">
            <option value="DOCTOR">Doctor</option>
            <option value="ADMIN">Administrativo</option>
            <option value="ASSISTANT">Secretaria</option>
          </Select>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        El correo debe ser único en toda la plataforma. Respeta el tope de usuarios del plan.
      </p>

      <Msg state={state} />
      <Submit>Crear usuario</Submit>
    </form>
  );
}

export function UserRowActions({
  userId,
  isActive,
  role,
  organizationId,
  clinics,
}: {
  userId: string;
  isActive: boolean;
  role: string;
  organizationId: string;
  clinics: ClinicOption[];
}) {
  const [estado, accionEstado] = useFormState(setUserActiveAction, initial);
  const [, accionRol] = useFormState(changeUserRoleAction, initial);
  const [, accionMover] = useFormState(moveUserAction, initial);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={accionRol}>
        <input type="hidden" name="userId" value={userId} />
        <Select name="role" defaultValue={role} className="h-9 w-36 text-[13px]" onChange={(e) => e.currentTarget.form?.requestSubmit()}>
          <option value="DOCTOR">Doctor</option>
          <option value="ADMIN">Administrativo</option>
          <option value="ASSISTANT">Secretaria</option>
        </Select>
      </form>

      {clinics.length > 1 && (
        <form action={accionMover}>
          <input type="hidden" name="userId" value={userId} />
          <Select
            name="organizationId"
            defaultValue={organizationId}
            className="h-9 w-40 text-[13px]"
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
          >
            {clinics.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </form>
      )}

      <form action={accionEstado}>
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="active" value={isActive ? "false" : "true"} />
        <Submit variant="ghost" size="sm">{isActive ? "Desactivar" : "Reactivar"}</Submit>
      </form>

      {estado.error && <span className="text-xs text-destructive">{estado.error}</span>}
    </div>
  );
}
