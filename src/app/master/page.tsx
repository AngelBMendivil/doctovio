import Link from "next/link";
import { Building2, Users, Wallet, AlertTriangle } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { listClinicsForPlatform } from "@/lib/services/clinics";
import { carteraSummary, carteraVencida, mrr, monthlySeries, periodOf } from "@/lib/services/platform-billing";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { BarChart } from "@/components/master/mini-chart";

export const dynamic = "force-dynamic";

const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export default async function MasterDashboard() {
  await requirePlatformAdmin();

  const [clinics, cartera, vencida, mrrEsperado, serie] = await Promise.all([
    listClinicsForPlatform(),
    carteraSummary(),
    carteraVencida(),
    mrr(),
    monthlySeries(6),
  ]);

  const periodoActual = periodOf(new Date());
  const nuevosDelMes = clinics.filter((c) => periodOf(c.createdAt) === periodoActual).length;

  const porEstado = {
    activos: clinics.filter((c) => c.status === "ACTIVE").length,
    prueba: clinics.filter((c) => c.status === "TRIAL").length,
    suspendidos: clinics.filter((c) => c.status === "SUSPENDED").length,
    cancelados: clinics.filter((c) => c.status === "CANCELLED").length,
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-navy">Doctovio</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Visión global del negocio · periodo {periodoActual}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Consultorios"
          value={clinics.length}
          hint={`${porEstado.activos} activos · ${porEstado.prueba} en prueba`}
          icon={Building2}
          tone="blue"
          href="/master/consultorios"
        />
        <StatCard
          label="Usuarios"
          value={clinics.reduce((s, c) => s + c.users, 0)}
          hint={`${nuevosDelMes} consultorio(s) nuevo(s) este mes`}
          icon={Users}
          tone="gray"
          href="/master/usuarios"
        />
        <StatCard
          label="MRR esperado"
          value={usd(mrrEsperado)}
          hint={`Cobrado ${usd(cartera.cobrado)} · ${cartera.porcentajeCobranza}%`}
          icon={Wallet}
          tone="teal"
          href="/master/cobranza"
        />
        <StatCard
          label="Cartera vencida"
          value={usd(vencida.total)}
          hint={`${vencida.rows.length} mensualidad(es) vencida(s)`}
          icon={AlertTriangle}
          tone="gray"
          emphasis={vencida.total > 0}
          href="/master/cobranza?estado=OVERDUE"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Activos", value: porEstado.activos, tone: "text-accent" },
          { label: "En prueba", value: porEstado.prueba, tone: "text-primary" },
          { label: "Suspendidos", value: porEstado.suspendidos, tone: "text-amber-600" },
          { label: "Cancelados", value: porEstado.cancelados, tone: "text-muted-foreground" },
        ].map((x) => (
          <div key={x.label} className="rounded-xl border border-border bg-card p-4 shadow-card">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{x.label}</div>
            <div className={`mt-1 text-2xl font-semibold ${x.tone}`}>{x.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ingresos</CardTitle>
            <CardDescription>Esperado contra cobrado, últimos 6 meses.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart
              data={serie.map((s) => ({ label: s.label, value: s.esperado, value2: s.cobrado }))}
              format={usd}
              colors={["fill-primary/40", "fill-accent"]}
              legend={["Esperado", "Cobrado"]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Consultorios</CardTitle>
            <CardDescription>Acumulado y altas por mes.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart
              data={serie.map((s) => ({ label: s.label, value: s.acumulado, value2: s.altas }))}
              colors={["fill-primary/40", "fill-accent"]}
              legend={["Acumulado", "Altas"]}
            />
          </CardContent>
        </Card>
      </div>

      {vencida.rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Requieren cobranza</CardTitle>
            <CardDescription>
              Mensualidades vencidas. Ningún consultorio se suspende solo: es decisión tuya.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="border-y border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Consultorio</th>
                    <th className="px-4 py-2.5 font-medium">Periodo</th>
                    <th className="px-4 py-2.5 text-right font-medium">Saldo</th>
                    <th className="px-4 py-2.5 text-right font-medium">Días</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {vencida.rows.slice(0, 10).map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2.5">
                        <Link href={`/master/consultorios/${r.organizationId}`} className="text-navy hover:text-primary">
                          {r.clinic}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{r.period}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-navy">{usd(r.saldo)}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-red-600">{r.daysOverdue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
