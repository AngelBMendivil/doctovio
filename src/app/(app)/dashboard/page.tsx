import Link from "next/link";
import {
  Armchair,
  Stethoscope,
  Wallet,
  CalendarClock,
  UserPlus,
  TrendingUp,
  CheckCircle2,
  ArrowRight,
  Plus,
} from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getDashboardData } from "@/lib/services/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const money = (n: number, currency: string) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

const TYPE_LABEL: Record<string, string> = {
  FIRST_TIME: "Primera vez",
  FOLLOW_UP: "Seguimiento",
  EXISTING_PATIENT: "Cita médica",
};

const STATUS_TONE: Record<string, { label: string; tone: "success" | "warning" | "info" | "soft" }> = {
  TO_CONFIRM: { label: "Por confirmar", tone: "warning" },
  CONFIRMED: { label: "Confirmada", tone: "success" },
  ARRIVED: { label: "En sala", tone: "soft" },
  WAITING: { label: "En espera", tone: "soft" },
  IN_CONSULTATION: { label: "En consulta", tone: "info" },
  COMPLETED: { label: "Completada", tone: "info" },
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) return null;

  const d = await getDashboardData(session.organizationId);
  const firstName = session.fullName.replace(/^Dr\(?a?\)?\.?\s*/i, "").split(" ")[0];
  const isAdmin = session.role === "ADMIN";
  const income = d.incomeMonth[0];

  const today = new Date().toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-1 text-sm capitalize text-muted-foreground">{today}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/patients/new">
            <Button variant="secondary" size="sm">
              <UserPlus className="h-4 w-4" />
              Nuevo paciente
            </Button>
          </Link>
          <Link href="/waiting-room">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Nueva cita
            </Button>
          </Link>
        </div>
      </div>

      {/* Métricas del día — lo que exige acción va primero */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="En sala de espera"
          value={d.waitingNow}
          hint={d.inConsultation > 0 ? `${d.inConsultation} en consulta` : "Nadie en consulta"}
          icon={Armchair}
          tone="teal"
          href="/waiting-room"
          emphasis={d.waitingNow > 0}
        />
        <StatCard
          label="Atendidos hoy"
          value={d.attendedToday}
          hint="Consultas finalizadas"
          icon={CheckCircle2}
          tone="teal"
          href="/consultations"
        />
        <StatCard
          label="Por cobrar"
          value={d.pendingPayment}
          hint={d.pendingPayment > 0 ? "Requieren cobro" : "Todo cobrado"}
          icon={Wallet}
          tone="blue"
          href="/payments"
          emphasis={d.pendingPayment > 0}
        />
        <StatCard
          label="Por confirmar"
          value={d.toConfirm}
          hint="Citas de hoy"
          icon={CalendarClock}
          tone="blue"
          href="/appointments"
        />
      </div>

      {/* Métricas del periodo */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {isAdmin && (
          <StatCard
            label="Ingresos del mes"
            value={income ? money(income.amount, income.currency) : "—"}
            hint={
              d.incomeMonth.length > 1
                ? d.incomeMonth
                    .slice(1)
                    .map((i) => money(i.amount, i.currency))
                    .join(" · ")
                : "Mes en curso"
            }
            icon={TrendingUp}
            tone="blue"
            href="/finance"
          />
        )}
        <StatCard
          label="Nuevos pacientes"
          value={d.newPatientsMonth}
          hint="Este mes"
          icon={UserPlus}
          tone="teal"
          href="/patients"
        />
        <StatCard
          label="Prerregistros"
          value={d.pendingPreRegs}
          hint={d.pendingPreRegs > 0 ? "Esperan revisión" : "Sin pendientes"}
          icon={Stethoscope}
          tone="gray"
          href="/preregistrations"
          emphasis={d.pendingPreRegs > 0}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Próximas citas */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Próximas citas</CardTitle>
            <Link
              href="/appointments"
              className="flex items-center gap-1 text-[13px] font-medium text-primary hover:underline"
            >
              Ver agenda <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {d.upcoming.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm text-muted-foreground">No hay más citas para hoy.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {d.upcoming.map((a) => {
                  const st = STATUS_TONE[a.status] ?? { label: a.status, tone: "soft" as const };
                  return (
                    <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                      <div className="flex w-14 shrink-0 flex-col items-center rounded-lg bg-muted py-1.5">
                        <span className="text-sm font-bold text-navy">
                          {new Date(a.startTime).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-navy">
                          {a.patient.firstName} {a.patient.lastLastName}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {TYPE_LABEL[a.type] ?? a.type} · {a.reason || "Sin motivo"}
                        </p>
                      </div>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Actividad reciente */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Actividad reciente</CardTitle>
            {isAdmin && (
              <Link
                href="/finance"
                className="flex items-center gap-1 text-[13px] font-medium text-primary hover:underline"
              >
                Ver finanzas <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {d.recentPayments.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm text-muted-foreground">Aún no hay cobros registrados.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {d.recentPayments.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                      <Wallet className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-navy">
                        Cobro a {p.patient.firstName} {p.patient.lastLastName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(p.createdAt).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
                        {" · "}
                        {p.origin === "INSURANCE" ? p.insurerName || "Aseguranza" : "Privado"}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-navy">
                      {money(p.amount, p.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
