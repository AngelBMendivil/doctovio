import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { getClinicDetail } from "@/lib/services/clinics";
import { activeSubscription, listProducts } from "@/lib/services/platform-catalog";
import { listCartera } from "@/lib/services/platform-billing";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EstadoForm, PlanForm } from "@/components/admin/clinic-forms";
import { AddUserToClinicForm, UserRowActions, SubscribeForm } from "@/components/master/master-forms";

export const dynamic = "force-dynamic";

const money = (n: number, c = "USD") => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })} ${c}`;
const fecha = (d: Date | null) =>
  d ? new Date(d).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" }) : "—";

const STATUS = {
  TRIAL: { text: "En prueba", tone: "info" as const },
  ACTIVE: { text: "Activo", tone: "success" as const },
  SUSPENDED: { text: "Suspendido", tone: "danger" as const },
  CANCELLED: { text: "Cancelado", tone: "default" as const },
};

const ROL = { ADMIN: "Administrativo", DOCTOR: "Doctor", ASSISTANT: "Secretaria" };

const VIEW = {
  PAID: { text: "Pagado", tone: "success" as const },
  PENDING: { text: "Pendiente", tone: "warning" as const },
  OVERDUE: { text: "Vencido", tone: "danger" as const },
  PARTIAL: { text: "Parcial", tone: "info" as const },
  WAIVED: { text: "Condonado", tone: "default" as const },
};

/**
 * Las pestañas van en la URL (`?tab=usuarios`), no en `useState`.
 *
 * Es regla del proyecto: con estado local se reinician al guardar y da la
 * impresión de haber perdido el trabajo. Además así el alta puede mandar
 * directo a la pestaña de usuarios.
 */
const TABS = [
  { key: "resumen", label: "Resumen" },
  { key: "usuarios", label: "Usuarios" },
  { key: "pagos", label: "Pagos" },
  { key: "actividad", label: "Actividad" },
  { key: "config", label: "Configuración" },
] as const;

export default async function ClinicDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  await requirePlatformAdmin();

  const c = await getClinicDetail(params.id);
  if (!c) notFound();

  const tab = TABS.some((t) => t.key === searchParams.tab) ? searchParams.tab! : "resumen";

  const [sub, cartera, products] = await Promise.all([
    activeSubscription(c.id),
    listCartera({ organizationId: c.id }),
    tab === "config" ? listProducts(true) : Promise.resolve([]),
  ]);

  const estado = STATUS[c.status];
  const activos = c.users.filter((u) => u.isActive).length;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/master/consultorios"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Consultorios
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-navy">{c.name}</h1>
          <Badge tone={estado.tone}>{estado.text}</Badge>
          <Badge tone="default">{c.type === "DENTAL" ? "Dental" : "Médico"}</Badge>
          <code className="rounded bg-muted px-2 py-1 font-mono text-sm text-navy">{c.code}</code>
        </div>

        <p className="mt-1 text-sm text-muted-foreground">
          {c.legalName ?? "Sin razón social"} · Alta el {fecha(c.createdAt)}
        </p>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/master/consultorios/${c.id}?tab=${t.key}`}
            className={
              tab === t.key
                ? "-mb-px shrink-0 border-b-2 border-primary px-4 py-2.5 text-sm font-medium text-primary"
                : "-mb-px shrink-0 border-b-2 border-transparent px-4 py-2.5 text-sm text-muted-foreground hover:text-navy"
            }
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "resumen" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-4">
            {[
              { label: "Usuarios", value: `${activos} / ${c.maxUsers}` },
              { label: "Pacientes", value: c._count.patients },
              { label: "Citas", value: c._count.appointments },
              { label: "Cuota", value: sub ? money(sub.price, sub.currency) : "Sin suscripción" },
            ].map((m) => (
              <div key={m.label} className="rounded-xl border border-border bg-card p-4 shadow-card">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{m.label}</div>
                <div className="mt-1 text-lg font-semibold text-navy">{m.value}</div>
              </div>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Suscripción</CardTitle>
              <CardDescription>Lo que tiene contratado hoy.</CardDescription>
            </CardHeader>
            <CardContent>
              {sub ? (
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  {[
                    ["Producto", sub.product.name],
                    ["Código", sub.product.code],
                    ["Precio contratado", money(sub.price, sub.currency)],
                    ["Precio de lista hoy", money(sub.product.price, sub.product.currency)],
                    ["Periodicidad", sub.billingFrequency === "YEARLY" ? "Anual" : "Mensual"],
                    ["Desde", fecha(sub.startedAt)],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
                      <dd className="mt-0.5 text-navy">{v}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Sin suscripción. Contrata un producto en la pestaña Configuración para
                  que entre a la cobranza.
                </p>
              )}

              {sub && sub.price !== sub.product.price && (
                <p className="mt-4 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                  El precio contratado difiere del de lista. Es correcto: se congela al
                  contratar, para que cambiar el catálogo no le mueva el cobro a quien ya firmó.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "usuarios" && (
        <div className="space-y-6">
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Nombre</th>
                    <th className="px-4 py-3 font-medium">Acceso</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 font-medium">Último acceso</th>
                    <th className="px-4 py-3 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {c.users.map((u) => (
                    <tr key={u.id} className={u.isActive ? "" : "bg-muted/30"}>
                      <td className="px-4 py-3">
                        <span className={u.isActive ? "font-medium text-navy" : "text-muted-foreground"}>
                          {u.fullName}
                        </span>
                        <div className="text-xs text-muted-foreground">{ROL[u.primaryRole]}</div>
                      </td>
                      <td className="px-4 py-3">
                        {u.username && (
                          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px] text-navy">
                            {u.username}
                          </code>
                        )}
                        {u.email && (
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={u.isActive ? "success" : "default"}>
                          {u.isActive ? "Activo" : "Inactivo"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {u.lastLoginAt ? fecha(u.lastLoginAt) : "Nunca"}
                      </td>
                      <td className="px-4 py-3">
                        <UserRowActions
                          userId={u.id}
                          isActive={u.isActive}
                          role={u.primaryRole}
                          organizationId={c.id}
                          clinics={[{ id: c.id, name: c.name }]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Agregar usuario</CardTitle>
              <CardDescription>Doctor, administrativo o secretaria de este consultorio.</CardDescription>
            </CardHeader>
            <CardContent>
              <AddUserToClinicForm organizationId={c.id} clinicCode={c.code} disponibles={c.maxUsers - activos} />
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "pagos" && (
        <Card>
          <CardHeader>
            <CardTitle>Mensualidades</CardTitle>
            <CardDescription>
              Se registran desde Cobranza. Aquí solo se consultan.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-y border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Periodo</th>
                    <th className="px-4 py-2.5 font-medium">Vence</th>
                    <th className="px-4 py-2.5 text-right font-medium">Importe</th>
                    <th className="px-4 py-2.5 text-right font-medium">Pagado</th>
                    <th className="px-4 py-2.5 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {cartera.map((r) => {
                    const v = VIEW[r.view];
                    return (
                      <tr key={r.id}>
                        <td className="px-4 py-2.5 text-navy">{r.period}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{fecha(r.dueDate)}</td>
                        <td className="px-4 py-2.5 text-right">{money(r.amount, r.currency)}</td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">
                          {r.paidAmount > 0 ? money(r.paidAmount, r.currency) : "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge tone={v.tone}>{v.text}</Badge>
                          {r.view === "OVERDUE" && (
                            <span className="ml-2 text-[11px] text-red-600">{r.daysOverdue} d</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {cartera.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        Sin mensualidades. Genéralas desde Cobranza.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "actividad" && (
        <Card>
          <CardHeader>
            <CardTitle>Actividad</CardTitle>
            <CardDescription>
              Volumen de uso. Son conteos: desde aquí no se ve información de pacientes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              {[
                ["Pacientes registrados", String(c._count.patients)],
                ["Citas agendadas", String(c._count.appointments)],
                ["Usuarios activos", `${activos} de ${c.maxUsers}`],
                [
                  "Último acceso del equipo",
                  (() => {
                    const ultimo = c.users
                      .map((u) => u.lastLoginAt)
                      .filter(Boolean)
                      .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0];
                    return ultimo ? fecha(ultimo) : "Nadie ha entrado";
                  })(),
                ],
                ["WhatsApp", c.whatsappConnections.some((w) => w.isActive) ? "Conectado" : "Sin número"],
                ["Cobertura pagada hasta", fecha(c.paidUntil)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-border p-4">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
                  <dd className="mt-1 text-navy">{v}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}

      {tab === "config" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Estado del servicio</CardTitle>
              <CardDescription>Suspender corta el acceso; no borra información.</CardDescription>
            </CardHeader>
            <CardContent>
              <EstadoForm organizationId={c.id} status={c.status} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Plan</CardTitle>
              <CardDescription>Giro y tope de usuarios.</CardDescription>
            </CardHeader>
            <CardContent>
              <PlanForm
                organizationId={c.id}
                type={c.type}
                maxUsers={c.maxUsers}
                planName={c.planName}
                monthlyFeeMxn={c.monthlyFeeMxn}
              />
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Suscripción</CardTitle>
              <CardDescription>
                Cambiar de producto cancela la anterior y congela el precio nuevo.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SubscribeForm organizationId={c.id} products={products} actual={sub?.productId ?? null} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
