import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { getClinicDetail } from "@/lib/services/clinics";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EstadoForm, PlanForm, PagoForm } from "@/components/admin/clinic-forms";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;
const fecha = (d: Date | null) =>
  d ? new Date(d).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" }) : "—";

/** `yyyy-mm-dd` en hora LOCAL, que es lo que espera un input[type=date]. */
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const STATUS = {
  TRIAL: { text: "En prueba", tone: "info" as const },
  ACTIVE: { text: "Activo", tone: "success" as const },
  SUSPENDED: { text: "Suspendido", tone: "danger" as const },
  CANCELLED: { text: "Cancelado", tone: "default" as const },
};

const ROL = { ADMIN: "Administrador", DOCTOR: "Médico", ASSISTANT: "Asistente" };

export default async function ClinicDetailPage({ params }: { params: { id: string } }) {
  await requirePlatformAdmin();

  const c = await getClinicDetail(params.id);
  if (!c) notFound();

  // Sugerencia para el siguiente pago: arranca donde terminó la cobertura
  // actual (o hoy, si nunca ha pagado) y cubre un mes.
  const hoy = new Date();
  const desde = c.paidUntil && c.paidUntil > hoy ? new Date(c.paidUntil) : hoy;
  const hasta = new Date(desde);
  hasta.setMonth(hasta.getMonth() + 1);

  const estado = STATUS[c.status];
  const vencido = c.payment.state === "VENCIDO";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Consultorios
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-navy">{c.name}</h1>
          <Badge tone={estado.tone}>{estado.text}</Badge>
          {vencido && <Badge tone="danger">Vencido hace {Math.abs(c.payment.days ?? 0)} días</Badge>}
        </div>

        <p className="mt-1 text-sm text-muted-foreground">
          {c.legalName ?? "Sin razón social"} · Alta el {fecha(c.createdAt)}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Usuarios", value: `${c.users.length} / ${c.maxUsers}` },
          { label: "Pacientes", value: c._count.patients },
          { label: "Citas", value: c._count.appointments },
          { label: "Pagado hasta", value: fecha(c.paidUntil) },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-border bg-card p-4 shadow-card">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{m.label}</div>
            <div className="mt-1 text-lg font-semibold text-navy">{m.value}</div>
          </div>
        ))}
      </div>

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
            <CardTitle>Plan contratado</CardTitle>
            <CardDescription>Giro, tope de usuarios y cuota mensual.</CardDescription>
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Registrar un pago</CardTitle>
          <CardDescription>Captura la transferencia que ya recibiste.</CardDescription>
        </CardHeader>
        <CardContent>
          <PagoForm
            organizationId={c.id}
            sugerido={{
              periodStart: iso(desde),
              periodEnd: iso(hasta),
              hoy: iso(hoy),
              amount: c.monthlyFeeMxn,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historial de pagos</CardTitle>
          <CardDescription>Últimos 24 pagos registrados.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-y border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Pagado</th>
                  <th className="px-4 py-2.5 font-medium">Periodo</th>
                  <th className="px-4 py-2.5 text-right font-medium">Monto</th>
                  <th className="px-4 py-2.5 font-medium">Forma</th>
                  <th className="px-4 py-2.5 font-medium">Referencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {c.clinicPayments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2.5">{fecha(p.paidAt)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {fecha(p.periodStart)} — {fecha(p.periodEnd)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-navy">{money(p.amount)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{p.method}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{p.reference ?? "—"}</td>
                  </tr>
                ))}
                {c.clinicPayments.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      Sin pagos registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usuarios</CardTitle>
          <CardDescription>
            Datos de la cuenta. Desde aquí no se ve información clínica ni de pacientes.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-y border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Nombre</th>
                  <th className="px-4 py-2.5 font-medium">Correo</th>
                  <th className="px-4 py-2.5 font-medium">Rol</th>
                  <th className="px-4 py-2.5 font-medium">Último acceso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {c.users.map((u) => (
                  <tr key={u.id} className={u.isActive ? "" : "opacity-50"}>
                    <td className="px-4 py-2.5 text-navy">{u.fullName}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{ROL[u.primaryRole]}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {u.lastLoginAt ? fecha(u.lastLoginAt) : "Nunca"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
