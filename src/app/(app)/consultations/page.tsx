import Link from "next/link";
import { Wallet, CheckCircle2 } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { listConsultations } from "@/lib/services/consultations";
import { calculateAge } from "@/lib/utils/age";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const STATUS: Record<string, { label: string; tone: "default" | "info" | "success" | "warning" | "danger" }> = {
  DRAFT: { label: "Borrador", tone: "warning" },
  IN_PROGRESS: { label: "En progreso", tone: "info" },
  COMPLETED: { label: "Finalizada", tone: "success" },
  CANCELLED: { label: "Cancelada", tone: "danger" },
  REOPENED: { label: "Reabierta", tone: "warning" },
};

const money = (n: number, currency: string) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(n);

const dateTime = (d: Date) =>
  new Date(d).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function ConsultationsPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  const session = await getSession();
  if (!session) return null;

  // Por defecto, el día de hoy: la pantalla es de trabajo, no de archivo.
  const today = new Date().toISOString().slice(0, 10);
  const fromStr = searchParams.from || today;
  const toStr = searchParams.to || today;
  const isToday = fromStr === today && toStr === today;

  // El médico ve sus consultas; el admin ve todas.
  const doctorId = session.role === "DOCTOR" ? session.userId : undefined;
  const consultations = await listConsultations(session.organizationId, {
    doctorId,
    from: new Date(`${fromStr}T00:00:00`),
    to: new Date(`${toStr}T23:59:59`),
  });

  // El ciclo cierra con dos condiciones, no una: atendida Y cobrada.
  const rows = consultations.map((c) => ({
    c,
    closed: c.status === "COMPLETED" && !!c.payment,
  }));
  const pending = rows.filter((r) => !r.closed);
  const closed = rows.filter((r) => r.closed);

  const Row = ({ c, showPayment }: { c: (typeof consultations)[number]; showPayment?: boolean }) => {
    const st = STATUS[c.status] ?? { label: c.status, tone: "default" as const };
    const needsPayment = c.status === "COMPLETED" && !c.payment;
    return (
      <tr className="border-b border-border last:border-0 hover:bg-muted/30">
        <td className="p-3 text-muted-foreground">{dateTime(c.date)}</td>
        <td className="p-3">
          <Link href={`/patients/${c.patientId}`} className="text-primary hover:underline">
            {c.patient.recordNumber}
          </Link>
        </td>
        <td className="p-3 font-medium">
          {c.patient.firstName} {c.patient.lastLastName}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {calculateAge(c.patient.birthDate)} años
          </span>
        </td>
        <td className="p-3 text-muted-foreground">Dr(a). {c.doctor.fullName}</td>
        <td className="p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={st.tone}>{st.label}</Badge>
            {needsPayment && <Badge tone="warning">Por cobrar</Badge>}
          </div>
        </td>
        {showPayment && (
          <td className="p-3 text-right tabular-nums text-muted-foreground">
            {c.payment ? money(c.payment.amount, c.payment.currency) : "—"}
          </td>
        )}
        <td className="p-3 text-right">
          {needsPayment ? (
            <Link href={`/payments/${c.id}`}>
              <Button size="sm">
                <Wallet className="h-4 w-4" />
                Cobrar
              </Button>
            </Link>
          ) : (
            <Link href={`/consultations/${c.id}`} className="text-primary hover:underline">
              Abrir
            </Link>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Consultas</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {isToday
              ? "Pendientes de hoy. Al finalizar y cobrar, la consulta pasa al historial."
              : `Del ${new Date(`${fromStr}T12:00:00`).toLocaleDateString("es-MX", { dateStyle: "long" })} al ${new Date(`${toStr}T12:00:00`).toLocaleDateString("es-MX", { dateStyle: "long" })}`}
          </p>
        </div>
      </div>

      {/* Rango de fechas: la pantalla también sirve de historial. */}
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
            <Button type="submit">Ver</Button>
            {!isToday && (
              <Link
                href="/consultations"
                className="inline-flex h-11 items-center rounded-lg border border-border px-3 text-sm hover:bg-muted"
              >
                Volver a hoy
              </Link>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Pendientes — lo que exige trabajo */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Pendientes ({pending.length})</h2>
        <Card>
          <CardContent className="overflow-x-auto p-0">
            {pending.length === 0 ? (
              <div className="p-10 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-accent/40" />
                <p className="mt-2 text-sm text-muted-foreground">
                  {consultations.length === 0
                    ? "No hay consultas en este rango. Se generan al iniciar una consulta desde la sala de espera."
                    : "Todo al día: no hay consultas pendientes de finalizar ni de cobrar."}
                </p>
              </div>
            ) : (
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-3">Fecha</th>
                    <th className="p-3">Expediente</th>
                    <th className="p-3">Paciente</th>
                    <th className="p-3">Médico</th>
                    <th className="p-3">Estatus</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map(({ c }) => (
                    <Row key={c.id} c={c} />
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Atendidas y cobradas — el ciclo ya cerró */}
      <details open={!isToday} className="rounded-xl border border-border bg-card">
        <summary className="cursor-pointer select-none p-4 text-sm font-semibold">
          Atendidas y cobradas ({closed.length})
        </summary>
        <div className="overflow-x-auto border-t border-border">
          {closed.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Aún no hay consultas cerradas en este rango.
            </p>
          ) : (
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Expediente</th>
                  <th className="p-3">Paciente</th>
                  <th className="p-3">Médico</th>
                  <th className="p-3">Estatus</th>
                  <th className="p-3 text-right">Cobrado</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {closed.map(({ c }) => (
                  <Row key={c.id} c={c} showPayment />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </details>
    </div>
  );
}
