import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { listCartera, carteraSummary, periodOf, type CycleView } from "@/lib/services/platform-billing";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GenerateCyclesForm, CyclePaymentForm, WaiveCycleForm } from "@/components/master/master-forms";

export const dynamic = "force-dynamic";

const money = (n: number, c = "USD") => `${c === "USD" ? "$" : "$"}${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
const fecha = (d: Date | null) =>
  d ? new Date(d).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "—";

const VIEW = {
  PAID: { text: "Pagado", tone: "success" as const },
  PENDING: { text: "Pendiente", tone: "warning" as const },
  OVERDUE: { text: "Vencido", tone: "danger" as const },
  PARTIAL: { text: "Parcial", tone: "info" as const },
  WAIVED: { text: "Condonado", tone: "default" as const },
};

const FILTROS: { key: CycleView | "TODOS"; label: string }[] = [
  { key: "TODOS", label: "Todos" },
  { key: "PENDING", label: "Pendientes" },
  { key: "OVERDUE", label: "Vencidos" },
  { key: "PAID", label: "Pagados" },
  { key: "PARTIAL", label: "Parciales" },
  { key: "WAIVED", label: "Condonados" },
];

export default async function CobranzaPage({
  searchParams,
}: {
  searchParams: { periodo?: string; estado?: string };
}) {
  await requirePlatformAdmin();

  const periodo = searchParams.periodo || periodOf(new Date());
  const estado = (searchParams.estado as CycleView | undefined) || undefined;

  const [rows, resumen] = await Promise.all([
    listCartera({ period: periodo, view: estado }),
    carteraSummary(periodo),
  ]);

  const hoy = new Date();
  const isoHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy">Cobranza</h1>
        <p className="mt-1 text-sm text-muted-foreground">Mensualidades del periodo {periodo}.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Esperado", value: money(resumen.esperado), tone: "text-navy" },
          { label: "Cobrado", value: money(resumen.cobrado), tone: "text-accent" },
          { label: "Pendiente", value: money(resumen.pendiente), tone: "text-amber-600" },
          { label: "Vencido", value: money(resumen.vencido), tone: "text-red-600" },
          { label: "Cobranza", value: `${resumen.porcentajeCobranza}%`, tone: "text-navy" },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-border bg-card p-4 shadow-card">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</div>
            <div className={`mt-1 text-xl font-semibold ${k.tone}`}>{k.value}</div>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Generar mensualidades</CardTitle>
          <CardDescription>Emite el cobro del periodo a los consultorios con suscripción activa.</CardDescription>
        </CardHeader>
        <CardContent>
          <GenerateCyclesForm period={periodo} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => {
          const activo = (estado ?? "TODOS") === f.key;
          const href = f.key === "TODOS" ? `/master/cobranza?periodo=${periodo}` : `/master/cobranza?periodo=${periodo}&estado=${f.key}`;
          return (
            <Link
              key={f.key}
              href={href}
              className={
                activo
                  ? "rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                  : "rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary"
              }
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Consultorio</th>
                <th className="px-4 py-3 font-medium">Producto</th>
                <th className="px-4 py-3 font-medium">Periodo</th>
                <th className="px-4 py-3 font-medium">Vence</th>
                <th className="px-4 py-3 text-right font-medium">Importe</th>
                <th className="px-4 py-3 text-right font-medium">Saldo</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Acción</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const v = VIEW[r.view];
                const saldo = r.amount - r.paidAmount;

                return (
                  <tr key={r.id} className="align-top hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link href={`/master/consultorios/${r.organizationId}`} className="font-medium text-navy hover:text-primary">
                        {r.clinic}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.product}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.period}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fecha(r.dueDate)}</td>
                    <td className="px-4 py-3 text-right">{money(r.amount, r.currency)}</td>
                    <td className="px-4 py-3 text-right font-medium text-navy">
                      {saldo > 0 ? money(saldo, r.currency) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={v.tone}>{v.text}</Badge>
                      {r.view === "OVERDUE" && (
                        <div className="mt-1 text-[11px] text-red-600">{r.daysOverdue} días</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.view === "PAID" || r.view === "WAIVED" ? (
                        <span className="text-xs text-muted-foreground">{fecha(r.paidAt)}</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <CyclePaymentForm cycleId={r.id} saldo={saldo} hoy={isoHoy} />
                          <WaiveCycleForm cycleId={r.id} />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    No hay mensualidades con ese filtro. Si el periodo está vacío, genéralas arriba.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        &quot;Vencido&quot; se calcula contra la fecha de hoy, no se guarda: así nunca puede
        quedar desactualizado. Condonar no borra la mensualidad, la deja marcada.
      </p>
    </div>
  );
}
