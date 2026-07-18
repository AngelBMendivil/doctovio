import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { listAgenda } from "@/lib/services/appointments";
import { listDoctors } from "@/lib/services/users";
import { NewAppointmentPanel } from "./new-appointment-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type View = "day" | "week" | "month";

const TYPE_DOT: Record<string, string> = {
  FIRST_TIME: "bg-amber-500",
  FOLLOW_UP: "bg-blue-500",
  EXISTING_PATIENT: "bg-primary",
};

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseYmd(s: string) {
  return new Date(`${s}T00:00:00`);
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function timeOf(d: Date) {
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

const WEEKDAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

type Appt = Awaited<ReturnType<typeof listAgenda>>[number];

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: { view?: string; date?: string };
}) {
  const session = await getSession();
  if (!session) return null;

  const view: View = searchParams.view === "day" || searchParams.view === "week" ? searchParams.view : "month";
  const todayStr = ymd(new Date());
  const dateStr = searchParams.date || todayStr;
  const date = parseYmd(dateStr);

  // Rango visible según la vista
  let rangeStart: Date;
  let rangeEnd: Date;
  let gridStart: Date | null = null;
  if (view === "day") {
    rangeStart = new Date(`${dateStr}T00:00:00`);
    rangeEnd = new Date(`${dateStr}T23:59:59`);
  } else if (view === "week") {
    rangeStart = addDays(date, -date.getDay());
    rangeEnd = new Date(addDays(rangeStart, 6));
    rangeEnd.setHours(23, 59, 59);
  } else {
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    gridStart = addDays(first, -first.getDay());
    rangeStart = gridStart;
    rangeEnd = new Date(addDays(gridStart, 41));
    rangeEnd.setHours(23, 59, 59);
  }

  // El panel de nueva cita busca pacientes contra el servidor conforme se
  // escribe, así que ya no hace falta traer el catálogo completo aquí.
  const [appts, doctors] = await Promise.all([
    listAgenda(session.organizationId, { from: rangeStart, to: rangeEnd }),
    listDoctors(session.organizationId),
  ]);

  const byDay = new Map<string, Appt[]>();
  for (const a of appts) {
    const key = ymd(new Date(a.startTime));
    (byDay.get(key) ?? byDay.set(key, []).get(key)!).push(a);
  }

  // Navegación prev/next según la vista
  const nav = (dir: number) => {
    if (view === "day") return ymd(addDays(date, dir));
    if (view === "week") return ymd(addDays(date, dir * 7));
    return ymd(new Date(date.getFullYear(), date.getMonth() + dir, 1));
  };
  const href = (v: View, d: string) => `/appointments?view=${v}&date=${d}`;

  const title =
    view === "day"
      ? date.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      : view === "week"
        ? `${rangeStart.getDate()} – ${addDays(rangeStart, 6).getDate()} de ${MONTHS[addDays(rangeStart, 6).getMonth()]} ${addDays(rangeStart, 6).getFullYear()}`
        : `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;

  const navBtn = "inline-flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-muted";
  const segBtn = (active: boolean) =>
    `px-3 py-1.5 text-sm font-medium rounded-md ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`;

  function Chip({ a }: { a: Appt }) {
    return (
      <Link
        href={`/patients/${a.patientId}`}
        className="flex items-center gap-1.5 truncate rounded px-1.5 py-0.5 text-[11px] hover:bg-muted"
        title={`${timeOf(new Date(a.startTime))} · ${a.patient.firstName} ${a.patient.lastLastName}`}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TYPE_DOT[a.type] ?? "bg-primary"}`} />
        <span className="shrink-0 text-muted-foreground">{timeOf(new Date(a.startTime))}</span>
        <span className="truncate">{a.patient.lastLastName}</span>
      </Link>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={href(view, nav(-1))} className={navBtn} aria-label="Anterior">◀</Link>
          <Link href={href(view, nav(1))} className={navBtn} aria-label="Siguiente">▶</Link>
          <Link href={href(view, todayStr)} className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-muted">Hoy</Link>
          <h1 className="ml-1 text-lg font-semibold capitalize">{title}</h1>
        </div>
        <div className="inline-flex gap-1 rounded-lg border border-border p-1">
          <Link href={href("day", dateStr)} className={segBtn(view === "day")}>Día</Link>
          <Link href={href("week", dateStr)} className={segBtn(view === "week")}>Semana</Link>
          <Link href={href("month", dateStr)} className={segBtn(view === "month")}>Mes</Link>
        </div>
      </div>

      {/* -------- MES -------- */}
      {view === "month" && gridStart && (
        <Card>
          <CardContent className="p-0">
            <div className="grid grid-cols-7 border-b border-border text-center text-xs font-medium text-muted-foreground">
              {WEEKDAYS.map((w) => (
                <div key={w} className="py-2">{w}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {Array.from({ length: 42 }).map((_, i) => {
                const cell = addDays(gridStart!, i);
                const key = ymd(cell);
                const inMonth = cell.getMonth() === date.getMonth();
                const isToday = key === todayStr;
                const list = byDay.get(key) ?? [];
                return (
                  <div key={key} className={`min-h-[104px] border-b border-r border-border p-1.5 ${inMonth ? "" : "bg-muted/30"}`}>
                    <Link
                      href={href("day", key)}
                      className={`mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${isToday ? "bg-primary text-primary-foreground" : inMonth ? "text-foreground hover:bg-muted" : "text-muted-foreground"}`}
                    >
                      {cell.getDate()}
                    </Link>
                    <div className="space-y-0.5">
                      {list.slice(0, 3).map((a) => <Chip key={a.id} a={a} />)}
                      {list.length > 3 && (
                        <Link href={href("day", key)} className="block px-1.5 text-[11px] text-primary">+{list.length - 3} más</Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* -------- SEMANA -------- */}
      {view === "week" && (
        <Card>
          <CardContent className="p-0">
            <div className="grid grid-cols-7">
              {Array.from({ length: 7 }).map((_, i) => {
                const day = addDays(rangeStart, i);
                const key = ymd(day);
                const isToday = key === todayStr;
                const list = byDay.get(key) ?? [];
                return (
                  <div key={key} className="min-h-[240px] border-r border-border last:border-r-0">
                    <Link href={href("day", key)} className={`block border-b border-border px-2 py-2 text-center text-xs ${isToday ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted"}`}>
                      {WEEKDAYS[day.getDay()]} {day.getDate()}
                    </Link>
                    <div className="space-y-1 p-1.5">
                      {list.length === 0 && <p className="px-1 text-[11px] text-muted-foreground/60">—</p>}
                      {list.map((a) => (
                        <Link key={a.id} href={`/patients/${a.patientId}`} className="block rounded-md border border-border p-1.5 text-[11px] hover:bg-muted">
                          <span className="flex items-center gap-1">
                            <span className={`h-1.5 w-1.5 rounded-full ${TYPE_DOT[a.type] ?? "bg-primary"}`} />
                            {timeOf(new Date(a.startTime))}
                          </span>
                          <span className="mt-0.5 block truncate font-medium">{a.patient.firstName} {a.patient.lastLastName}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* -------- DÍA -------- */}
      {view === "day" && (
        <Card>
          <CardContent className="space-y-2 pt-6">
            {(byDay.get(dateStr) ?? []).length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">Sin citas para este día.</p>
            )}
            {(byDay.get(dateStr) ?? []).map((a) => (
              <Link
                key={a.id}
                href={`/patients/${a.patientId}`}
                className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted"
              >
                <span className="w-16 shrink-0 text-sm font-medium">{timeOf(new Date(a.startTime))}</span>
                <span className={`h-2 w-2 shrink-0 rounded-full ${TYPE_DOT[a.type] ?? "bg-primary"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{a.patient.firstName} {a.patient.lastLastName}</span>
                  <span className="block truncate text-xs text-muted-foreground">Dr(a). {a.doctor.fullName} · {a.reason || "Sin motivo"}</span>
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" /> Primera vez</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-500" /> Seguimiento</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" /> Cita médica</span>
      </div>

      <Card>
        <CardHeader><CardTitle>Nueva cita</CardTitle></CardHeader>
        <CardContent>
          <NewAppointmentPanel
            doctors={doctors.map((d) => ({ id: d.id, fullName: d.fullName }))}
            defaultDate={dateStr}
          />
        </CardContent>
      </Card>
    </div>
  );
}
