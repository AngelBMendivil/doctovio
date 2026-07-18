import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { getIncomeReport } from "@/lib/services/reports";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { PaymentOrigin } from "@prisma/client";

const money = (n: number, currency: string) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(n);

export default async function FinancePage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; origin?: string };
}) {
  const session = await getSession();
  if (!session) return null;
  if (session.role !== "ADMIN") {
    return <p className="text-sm text-muted-foreground">Solo el administrador puede ver los reportes de Finanzas.</p>;
  }

  // Por defecto: el mes en curso.
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const todayStr = now.toISOString().slice(0, 10);

  const fromStr = searchParams.from || firstOfMonth;
  const toStr = searchParams.to || todayStr;
  const originParam = searchParams.origin === "PRIVATE" || searchParams.origin === "INSURANCE"
    ? (searchParams.origin as PaymentOrigin)
    : undefined;

  const report = await getIncomeReport(session.organizationId, {
    from: new Date(`${fromStr}T00:00:00`),
    to: new Date(`${toStr}T23:59:59`),
    origin: originParam,
  });

  const { rows, totals } = report;
  const csvHref = `/finance/export?from=${fromStr}&to=${toStr}${originParam ? `&origin=${originParam}` : ""}`;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Finanzas</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Pacientes atendidos y cobrados. Solo incluye consultas con pago registrado.
        </p>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <form className="flex flex-wrap items-end gap-3">
            <div>
              <Label>Desde</Label>
              <Input type="date" name="from" defaultValue={fromStr} className="w-44" />
            </div>
            <div>
              <Label>Hasta</Label>
              <Input type="date" name="to" defaultValue={toStr} className="w-44" />
            </div>
            <div>
              <Label>Origen</Label>
              <Select name="origin" defaultValue={originParam ?? ""} className="w-44">
                <option value="">Todos</option>
                <option value="PRIVATE">Privado</option>
                <option value="INSURANCE">Aseguranza</option>
              </Select>
            </div>
            <Button type="submit">Aplicar</Button>
            <Link
              href="/finance"
              className="inline-flex h-10 items-center rounded-md border border-border px-3 text-sm hover:bg-muted"
            >
              Limpiar
            </Link>
            <a
              href={csvHref}
              className="inline-flex h-10 items-center rounded-md border border-border px-3 text-sm hover:bg-muted"
            >
              Exportar CSV
            </a>
          </form>
        </CardContent>
      </Card>

      {/* Totales */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Pacientes cobrados</p>
            <p className="mt-1 text-2xl font-semibold">{totals.count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Importe total</p>
            {totals.byCurrency.length === 0 ? (
              <p className="mt-1 text-2xl font-semibold">—</p>
            ) : (
              totals.byCurrency.map((t) => (
                <p key={t.currency} className="mt-1 text-2xl font-semibold">{money(t.amount, t.currency)}</p>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Por origen</p>
            <p className="mt-1 text-sm">
              Privado: <b>{totals.privateCount}</b>
              <br />
              Aseguranza: <b>{totals.insuranceCount}</b>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detalle */}
      <Card>
        <CardContent className="overflow-x-auto pt-6">
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No hay cobros registrados en este rango de fechas.
            </p>
          ) : (
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">ID paciente</th>
                  <th className="py-2 pr-3 font-medium">Nombre</th>
                  <th className="py-2 pr-3 font-medium">Fecha</th>
                  <th className="py-2 pr-3 font-medium">Médico</th>
                  <th className="py-2 pr-3 text-right font-medium">Importe</th>
                  <th className="py-2 pr-3 font-medium">Origen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.paymentId} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{r.recordNumber}</td>
                    <td className="py-2 pr-3 font-medium">{r.patientName}</td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {r.date.toLocaleDateString("es-MX", { dateStyle: "medium" })}
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.doctorName}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(r.amount, r.currency)}</td>
                    <td className="py-2 pr-3">
                      {r.origin === "INSURANCE" ? (
                        <Badge tone="info">{r.insurerName ? `Aseguranza · ${r.insurerName}` : "Aseguranza"}</Badge>
                      ) : (
                        <Badge tone="default">Privado</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
