import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { listTodayBoard } from "@/lib/services/appointments";
import { listDoctors } from "@/lib/services/users";
import { registerArrivalAction, startConsultationAction } from "@/lib/actions/visits";
import { finalizeConsultationAction } from "@/lib/actions/consultations";
import { ensureAppointmentPreRegAction } from "@/lib/actions/preregistration";
import { NewAppointmentPanel } from "@/app/(app)/appointments/new-appointment-panel";
import { SendPreRegButton } from "./send-prereg-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutoRefresh } from "@/components/ui/auto-refresh";

const TYPE_LABEL: Record<string, string> = {
  FIRST_TIME: "Primera vez",
  FOLLOW_UP: "Seguimiento",
  EXISTING_PATIENT: "Cita médica",
};

const REG_STATUS: Record<string, { label: string; tone: "default" | "info" | "success" | "warning" | "danger" }> = {
  TO_CONFIRM: { label: "Por confirmar", tone: "warning" },
  CONFIRMED: { label: "Confirmada", tone: "info" },
  ARRIVED: { label: "En sala", tone: "info" },
  WAITING: { label: "En espera", tone: "info" },
  IN_CONSULTATION: { label: "En consulta", tone: "info" },
  COMPLETED: { label: "Atendido", tone: "success" },
  NO_SHOW: { label: "No asistió", tone: "danger" },
};

export default async function WaitingRoomPage({ searchParams }: { searchParams: { date?: string } }) {
  const session = await getSession();
  if (!session) return null;

  const today = new Date().toISOString().slice(0, 10);
  const dateStr = searchParams.date || today;
  const isToday = dateStr === today;
  const canClinical = session.role === "ADMIN" || session.role === "DOCTOR";
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const baseDay = new Date(`${dateStr}T00:00:00`);
  const shift = (days: number) => {
    const d = new Date(baseDay);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const navBtn = "inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm hover:bg-muted";

  // El panel ya no recibe el catálogo completo: busca contra el servidor
  // conforme recepción escribe, así no se carga a todos los pacientes de balde.
  const [board, doctors] = await Promise.all([
    listTodayBoard(session.organizationId, dateStr),
    listDoctors(session.organizationId),
  ]);

  const rows = board.map((a) => {
    const visit = a.visit;
    const consultation = visit?.consultation ?? null;
    const attended = consultation?.status === "COMPLETED";
    const paid = !!consultation?.payment;
    // El prerregistro depende del ESTADO del expediente, no del tipo de cita:
    // el token solo existe si el paciente se dio de alta como nuevo. Si ya lo
    // envió, no hay nada que pedirle.
    const token = a.publicFormTokens[0];
    const preRegDone = !!token && (token.status === "SUBMITTED" || token.status === "CONVERTED");
    const needsPreReg = !!token && !preRegDone;
    const preRegUrl = token ? `${base}/public/prerregistro/${token.token}` : null;
    return { a, visit, consultation, attended, paid, token, preRegDone, needsPreReg, preRegUrl };
  });

  const active = rows.filter((r) => !r.paid);
  const porCobrar = rows.filter((r) => r.attended && !r.paid).length;
  const cobrados = rows.filter((r) => r.paid).length;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Sala de espera</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {new Date(`${dateStr}T00:00:00`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Solo hoy: los días pasados no cambian, refrescarlos es gasto inútil. */}
          {isToday && <AutoRefresh seconds={30} />}
          <Link href={`/waiting-room?date=${shift(-1)}`} className={navBtn} aria-label="Día anterior">◀</Link>
          <form className="flex items-center gap-2">
            <Input type="date" name="date" defaultValue={dateStr} className="w-40" />
            <Button type="submit" variant="outline" size="sm">Ver</Button>
          </form>
          <Link href={`/waiting-room?date=${shift(1)}`} className={navBtn} aria-label="Día siguiente">▶</Link>
          {!isToday && <Link href="/waiting-room" className={navBtn}>Hoy</Link>}
        </div>
      </div>

      {/* Registro / agendar: colapsado para no robar espacio */}
      {isToday && (
        <details className="rounded-xl border border-border bg-card">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-primary">
            + Registrar o agendar paciente
          </summary>
          <div className="border-t border-border p-4">
            <NewAppointmentPanel
              doctors={doctors.map((d) => ({ id: d.id, fullName: d.fullName }))}
              defaultDate={dateStr}
            />
          </div>
        </details>
      )}

      {/* ATENCIÓN DE HOY — protagonista */}
      {isToday && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Atención de hoy ({active.length})</h2>
            <div className="text-xs text-muted-foreground">Por cobrar: <b className="text-amber-600">{porCobrar}</b> · Cobrados: <b className="text-primary">{cobrados}</b></div>
          </div>

          {active.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              Nadie en atención. Usa “Registrar o agendar paciente” para comenzar.
            </div>
          )}

          {active.map(({ a, visit, consultation, attended, preRegDone, needsPreReg, preRegUrl }) => {
            const hora = new Date(a.startTime).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
            const passBlocked = needsPreReg && !canClinical;

            // Etapa del paciente
            let stage: { label: string; tone: "default" | "info" | "success" | "warning" } = { label: "Por llegar", tone: "warning" };
            if (attended) stage = { label: "Atendido — por cobrar", tone: "success" };
            else if (consultation) stage = { label: "En consulta", tone: "info" };
            else if (visit) stage = { label: "En sala", tone: "info" };

            return (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-card">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Paciente</span>
                    <span className="text-[15px] font-semibold">{a.patient.firstName} {a.patient.lastLastName}</span>
                    {preRegDone && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">✓ Prerregistro</span>
                    )}
                    {needsPreReg && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">⧗ Prerregistro pendiente</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{hora} · Dr(a). {a.doctor.fullName} · {a.reason || "Sin motivo"}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Badge tone="info">{TYPE_LABEL[a.type] ?? a.type}</Badge>
                    <Badge tone={stage.tone}>{stage.label}</Badge>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {needsPreReg &&
                    (preRegUrl ? (
                      <SendPreRegButton url={preRegUrl} patientName={a.patient.firstName} phone={a.patient.phone} />
                    ) : (
                      <form action={ensureAppointmentPreRegAction}>
                        <input type="hidden" name="appointmentId" value={a.id} />
                        <Button type="submit" size="sm" variant="secondary">Preparar QR</Button>
                      </form>
                    ))}

                  {/* Flujo operativo por etapa */}
                  {attended ? (
                    consultation && (
                      <Link href={`/payments/${consultation.id}`} className="inline-flex h-8 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
                        Cobrar
                      </Link>
                    )
                  ) : consultation ? (
                    canClinical && (
                      <form action={finalizeConsultationAction.bind(null, consultation.id)}>
                        <Button type="submit" size="sm">Confirmar atendido</Button>
                      </form>
                    )
                  ) : visit ? (
                    canClinical ? (
                      <form action={startConsultationAction}>
                        <input type="hidden" name="visitId" value={visit.id} />
                        <Button type="submit" size="sm">Iniciar consulta</Button>
                      </form>
                    ) : (
                      <span className="text-xs text-muted-foreground">En sala</span>
                    )
                  ) : passBlocked ? (
                    <span className="text-xs text-muted-foreground">Requiere prerregistro</span>
                  ) : (
                    <form action={registerArrivalAction}>
                      <input type="hidden" name="appointmentId" value={a.id} />
                      <Button type="submit" size="sm" variant="outline">Pasar a consulta</Button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* REGISTRO DEL DÍA — historial (colapsable) */}
      <details open={!isToday} className="rounded-xl border border-border bg-card">
        <summary className="cursor-pointer select-none p-4 text-sm font-semibold">Registro del día ({board.length})</summary>
        <div className="overflow-x-auto px-4 pb-4">
          {board.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin registros para este día.</p>
          ) : (
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Hora</th>
                  <th className="py-2 pr-3 font-medium">Paciente</th>
                  <th className="py-2 pr-3 font-medium">Expediente</th>
                  <th className="py-2 pr-3 font-medium">Tipo</th>
                  <th className="py-2 pr-3 font-medium">Médico</th>
                  <th className="py-2 pr-3 font-medium">Estatus</th>
                  <th className="py-2 pr-3 font-medium">Cobro</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ a, attended, paid }) => {
                  const st = REG_STATUS[a.status] ?? { label: a.status, tone: "default" as const };
                  return (
                    <tr key={a.id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3 text-muted-foreground">{new Date(a.startTime).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="py-2 pr-3 font-medium">{a.patient.firstName} {a.patient.lastLastName}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{a.patient.recordNumber}</td>
                      <td className="py-2 pr-3">{TYPE_LABEL[a.type] ?? a.type}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{a.doctor.fullName}</td>
                      <td className="py-2 pr-3">{attended ? <span className="text-green-700">Atendido</span> : <Badge tone={st.tone}>{st.label}</Badge>}</td>
                      <td className="py-2 pr-3">{paid ? <span className="text-primary">Cobrado</span> : <span className="text-muted-foreground">Pendiente</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </details>
    </div>
  );
}
