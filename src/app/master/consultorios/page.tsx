import Link from "next/link";
import { Building2, Users, AlertTriangle, Wallet, Plus } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { listClinicsForPlatform, platformSummary, type PaymentState } from "@/lib/services/clinics";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;

const STATUS_LABEL = {
  TRIAL: { text: "En prueba", tone: "info" as const },
  ACTIVE: { text: "Activo", tone: "success" as const },
  SUSPENDED: { text: "Suspendido", tone: "danger" as const },
  CANCELLED: { text: "Cancelado", tone: "default" as const },
};

/** Cobranza en palabras. El número de días es lo que decide una llamada. */
function paymentLabel(state: PaymentState, days: number | null) {
  switch (state) {
    case "VENCIDO":
      return { text: `Vencido hace ${Math.abs(days ?? 0)} d`, tone: "danger" as const };
    case "POR_VENCER":
      return { text: days === 0 ? "Vence hoy" : `Vence en ${days} d`, tone: "warning" as const };
    case "AL_CORRIENTE":
      return { text: "Al corriente", tone: "success" as const };
    default:
      return { text: "Sin pagos", tone: "default" as const };
  }
}

export default async function AdminPage() {
  await requirePlatformAdmin();

  const [clinics, resumen] = await Promise.all([listClinicsForPlatform(), platformSummary()]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-navy">Consultorios</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Estado y cobranza de los consultorios de la plataforma.
          </p>
        </div>

        <Link
          href="/master/consultorios/nuevo"
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Nuevo consultorio
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Consultorios"
          value={resumen.total}
          hint={`${resumen.operando} operando · ${resumen.enPrueba} en prueba`}
          icon={Building2}
          tone="blue"
        />
        <StatCard label="Usuarios" value={resumen.usuarios} hint="En toda la plataforma" icon={Users} tone="gray" />
        <StatCard
          label="Ingreso mensual"
          value={money(resumen.ingresoMensual)}
          hint="Cuotas de los que operan"
          icon={Wallet}
          tone="teal"
        />
        <StatCard
          label="Requieren atención"
          value={resumen.vencidos + resumen.porVencer}
          hint={`${resumen.vencidos} vencidos · ${resumen.porVencer} por vencer`}
          icon={AlertTriangle}
          tone="gray"
          emphasis={resumen.vencidos > 0}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
        {/* La tabla desborda a lo ancho en pantallas chicas, no la página. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Consultorio</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Cobranza</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 text-right font-medium">Usuarios</th>
                <th className="px-4 py-3 text-right font-medium">Pacientes</th>
                <th className="px-4 py-3 text-right font-medium">Citas</th>
                <th className="px-4 py-3 font-medium">Salud</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {clinics.map((c) => {
                const estado = STATUS_LABEL[c.status];
                const pago = paymentLabel(c.paymentState, c.paymentDays);

                return (
                  <tr key={c.id} className="transition-colors hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link href={`/master/consultorios/${c.id}`} className="font-medium text-navy hover:text-primary">
                        {c.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {c.type === "DENTAL" ? "Dental" : "Médico"}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <Badge tone={estado.tone}>{estado.text}</Badge>
                    </td>

                    <td className="px-4 py-3">
                      <Badge tone={pago.tone}>{pago.text}</Badge>
                    </td>

                    <td className="px-4 py-3 text-muted-foreground">
                      {c.planName ?? "—"}
                      {c.monthlyFeeMxn ? (
                        <span className="block text-xs">{money(c.monthlyFeeMxn)}/mes</span>
                      ) : null}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <span className={c.overUserLimit ? "font-medium text-red-600" : ""}>
                        {c.users}
                      </span>
                      <span className="text-muted-foreground"> / {c.maxUsers}</span>
                    </td>

                    <td className="px-4 py-3 text-right text-muted-foreground">{c.patients}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{c.appointments}</td>

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {/* Sin horario el motor de agenda no ofrece un solo
                            espacio: el consultorio existe pero no puede agendar. */}
                        {!c.hasSchedule && <Badge tone="danger">Sin horario</Badge>}
                        {!c.whatsapp && <Badge tone="warning">Sin WhatsApp</Badge>}
                        {c.overUserLimit && <Badge tone="danger">Excede usuarios</Badge>}
                        {c.hasSchedule && c.whatsapp && !c.overUserLimit && (
                          <span className="text-xs text-muted-foreground">Todo en orden</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {clinics.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    Todavía no hay consultorios.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Ningún consultorio se suspende solo por falta de pago. Vencido solo
        significa que hay que hablarle: suspender siempre es una decisión tuya.
      </p>
    </div>
  );
}
