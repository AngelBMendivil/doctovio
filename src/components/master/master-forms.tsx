"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  createClinicAction,
  createProductAction,
  updateProductAction,
  subscribeClinicAction,
  generateCyclesAction,
  registerCyclePaymentAction,
  waiveCycleAction,
  createUserAction,
  type MasterState,
} from "@/lib/actions/master";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { STATES_BY_COUNTRY } from "@/lib/constants/locations";
import { suggestClinicCode, suggestUsername } from "@/lib/utils/clinic-code";

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

// -------------------------------------------------------------- CONSULTORIOS

export function NewClinicForm({
  products,
  hoy,
}: {
  products: { id: string; name: string; code: string; price: number; currency: string }[];
  hoy: string;
}) {
  const [state, action] = useFormState(createClinicAction, initial);
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const producto = products.find((p) => p.id === productId);

  // El código se sugiere del nombre mientras se escribe, pero deja de
  // seguirlo en cuanto alguien lo edita a mano: si no, sobrescribiría lo que
  // el operador acaba de teclear.
  const [code, setCode] = useState("");
  const [codeTocado, setCodeTocado] = useState(false);

  return (
    <form action={action} className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Información general
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nombre comercial *</Label>
            <Input
              id="name"
              name="name"
              required
              placeholder="Clínica López"
              onChange={(e) => {
                if (!codeTocado) setCode(suggestClinicCode(e.target.value));
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="code">Código *</Label>
            <Input
              id="code"
              name="code"
              required
              value={code}
              maxLength={4}
              className="font-mono uppercase"
              placeholder="CLP"
              onChange={(e) => {
                setCodeTocado(true);
                setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
              }}
            />
            <p className="text-xs text-muted-foreground">
              Se sugiere del nombre y puedes ajustarlo.{" "}
              <span className="font-medium text-navy">Esta es la única oportunidad:</span>{" "}
              después queda congelado, porque va dentro del usuario de cada
              persona del consultorio ({code ? code.toLowerCase() : "clp"}.carlos).
            </p>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="legalName">Razón social</Label>
            <Input id="legalName" name="legalName" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="type">Tipo de consultorio</Label>
            <Select id="type" name="type" defaultValue="MEDICAL">
              <option value="MEDICAL">Médico</option>
              <option value="DENTAL">Dental</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="timezone">Zona horaria</Label>
            <Select id="timezone" name="timezone" defaultValue="America/Mexico_City">
              <option value="America/Tijuana">Tijuana / Baja California</option>
              <option value="America/Hermosillo">Hermosillo / Sonora</option>
              <option value="America/Mazatlan">Mazatlán / Sinaloa</option>
              <option value="America/Monterrey">Monterrey / Noreste</option>
              <option value="America/Mexico_City">Ciudad de México / Centro</option>
              <option value="America/Merida">Mérida / Yucatán</option>
              <option value="America/Cancun">Cancún / Quintana Roo</option>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="address">Dirección</Label>
            <Input id="address" name="address" placeholder="Calle, número, colonia" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="city">Ciudad</Label>
            <Input id="city" name="city" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="postalCode">Código postal</Label>
            {/* 5 dígitos. inputMode numérico para que en celular salga el
                teclado de números, pero el tipo sigue siendo texto: con
                type="number" se pierden los ceros a la izquierda, y hay CP
                que empiezan con cero. */}
            <Input
              id="postalCode"
              name="postalCode"
              inputMode="numeric"
              pattern="[0-9]{5}"
              maxLength={5}
              placeholder="22010"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="state">Estado</Label>
            {/* Se reusa la lista de lib/constants/locations.ts, la misma que
                usa Configuración. Duplicarla acabaría con dos listas que se
                desincronizan. */}
            <Select id="state" name="state" defaultValue="">
              <option value="">Selecciona un estado</option>
              {STATES_BY_COUNTRY.MX.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Doctor principal
        </h2>
        <p className="-mt-2 text-xs text-muted-foreground">
          Es el primer usuario y queda como administrador del consultorio: puede
          configurarlo y recetar. El resto del equipo se agrega en el siguiente paso.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="doctorName">Nombre completo *</Label>
            <Input id="doctorName" name="doctorName" required placeholder="Dra. Ana López" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Teléfono</Label>
            <Input id="phone" name="phone" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Correo *</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Contraseña temporal *</Label>
            <Input id="password" name="password" type="password" minLength={8} required />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Información comercial
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="productId">Producto</Label>
            <Select id="productId" name="productId" value={productId} onChange={(e) => setProductId(e.target.value)}>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.price} {p.currency}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="price">Precio pactado</Label>
            {/* El precio sale del catálogo. Se puede sobrescribir para un
                descuento negociado, y ese valor queda congelado en la
                suscripción. */}
            <Input
              id="price"
              name="price"
              type="number"
              min={0}
              step="0.01"
              key={productId}
              defaultValue={producto?.price}
              placeholder="Del catálogo"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="startedAt">Fecha de inicio</Label>
            <Input id="startedAt" name="startedAt" type="date" defaultValue={hoy} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="status">Estado inicial</Label>
            <Select id="status" name="status" defaultValue="TRIAL">
              <option value="TRIAL">En prueba</option>
              <option value="ACTIVE">Activo</option>
            </Select>
          </div>
        </div>
      </section>

      <div className="rounded-lg bg-muted p-4 text-xs leading-relaxed text-muted-foreground">
        Al guardar se crea el consultorio con su configuración, sucursal, usuario,
        perfil médico y <span className="font-medium text-navy">horario laboral</span>{" "}
        (lun-vie 9-14 y 16-19, editable después). Sin horario el motor de agenda no
        ofrece un solo espacio y el consultorio no podría agendar nada.
      </div>

      <Msg state={state} />
      <Submit>Crear consultorio</Submit>
    </form>
  );
}

/** Contrata (o cambia) el producto de un consultorio. */
export function SubscribeForm({
  organizationId,
  products,
  actual,
}: {
  organizationId: string;
  products: { id: string; name: string; code: string; price: number; currency: string }[];
  actual: string | null;
}) {
  const [state, action] = useFormState(subscribeClinicAction, initial);
  const [productId, setProductId] = useState(actual ?? products[0]?.id ?? "");
  const producto = products.find((p) => p.id === productId);

  if (products.length === 0) {
    return <Alert tone="info">No hay productos activos en el catálogo.</Alert>;
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="organizationId" value={organizationId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="s-productId">Producto</Label>
          <Select id="s-productId" name="productId" value={productId} onChange={(e) => setProductId(e.target.value)}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.price} {p.currency}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="s-price">Precio pactado</Label>
          <Input
            id="s-price"
            name="price"
            type="number"
            min={0}
            step="0.01"
            key={productId}
            defaultValue={producto?.price}
            placeholder="Del catálogo"
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        El precio queda congelado en la suscripción. Cambiar después el catálogo no
        le mueve el cobro a este consultorio ni altera sus mensualidades emitidas.
      </p>

      <Msg state={state} />
      <Submit variant="secondary">{actual ? "Cambiar producto" : "Contratar"}</Submit>
    </form>
  );
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

type ClinicOption = { id: string; name: string; code?: string };

export function CreateUserForm({
  clinics,
  preseleccion,
}: {
  clinics: ClinicOption[];
  /** Consultorio ya elegido, cuando se llega desde su detalle. */
  preseleccion?: string;
}) {
  const [state, action] = useFormState(createUserAction, initial);
  // Se muestra el alias que le va a tocar mientras se escribe el nombre.
  const [nombre, setNombre] = useState("");
  const [orgId, setOrgId] = useState(preseleccion ?? clinics[0]?.id ?? "");
  const codigo = clinics.find((c) => c.id === orgId)?.code ?? "";

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="fullName">Nombre completo *</Label>
          <Input id="fullName" name="fullName" required onChange={(e) => setNombre(e.target.value)} />
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
          <Label htmlFor="organizationId">Consultorio *</Label>
          <Select
            id="organizationId"
            name="organizationId"
            required
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
          >
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
        Entrará con{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-navy">
          {codigo && nombre ? suggestUsername(codigo, nombre) : `${codigo.toLowerCase() || "cod"}.nombre`}
        </code>{" "}
        o con su correo. El correo debe ser único en toda la plataforma y se respeta
        el tope de usuarios del plan.
      </p>

      <Msg state={state} />
      <Submit>Crear usuario</Submit>
    </form>
  );
}
