import Link from "next/link";
import { MessageSquare, LifeBuoy, Clock, CalendarCheck, CheckCircle2, Inbox } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { listConversations, getConversation, type InboxBucket, type InboxRow } from "@/lib/conversation/orchestrator";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import { Simulator } from "./simulator";
import { ConversationPanel } from "./conversation-panel";
import { cn } from "@/lib/utils/cn";

/**
 * Los segmentos están ordenados por urgencia operativa, no por lógica interna:
 * primero quien espera a una persona, al final lo ya cerrado.
 */
const BUCKETS: { id: InboxBucket; label: string; icon: typeof LifeBuoy; hint: string }[] = [
  { id: "ayuda", label: "Requieren ayuda", icon: LifeBuoy, hint: "El asistente no pudo: esperan a una persona." },
  { id: "proceso", label: "En proceso", icon: Clock, hint: "Conversación a medias: pueden abandonarla." },
  { id: "cita", label: "Con cita agendada", icon: CalendarCheck, hint: "Cerraron con una cita próxima." },
  { id: "resueltas", label: "Resueltas", icon: CheckCircle2, hint: "Cerradas por el consultorio." },
];

const relative = (minutes: number) => {
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const h = Math.floor(minutes / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
};

function Row({ r, active }: { r: InboxRow; active: boolean }) {
  // La espera solo alarma cuando alguien debería estar contestando.
  const stale = r.bucket === "ayuda" && r.waitingMinutes > 30;

  return (
    <li>
      <Link
        href={`/whatsapp?id=${r.id}`}
        className={cn(
          "block px-5 py-3 transition-colors hover:bg-muted",
          active && "bg-primary/5",
          stale && "border-l-2 border-amber-500"
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-semibold text-navy">{r.patientName ?? r.phoneMasked}</p>
          <span className={cn("shrink-0 text-[11px]", stale ? "font-semibold text-amber-600" : "text-muted-foreground")}>
            {relative(r.waitingMinutes)}
          </span>
        </div>

        <p className="mt-0.5 truncate text-xs text-muted-foreground">{r.activity}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground/80">{r.lastMessage}</p>

        {r.appointment && (
          <p className="mt-1 text-[11px] text-accent">
            {new Date(r.appointment.startTime).toLocaleString("es-MX", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
            {r.appointment.folio ? ` · ${r.appointment.folio}` : ""}
          </p>
        )}
      </Link>
    </li>
  );
}

export default async function WhatsAppPage({
  searchParams,
}: {
  searchParams: { id?: string; tel?: string; b?: string };
}) {
  const session = await getSession();
  if (!session) return null;

  const phone = searchParams.tel || "5551234567";
  const [conversations, active] = await Promise.all([
    listConversations(session.organizationId),
    searchParams.id ? getConversation(session.organizationId, searchParams.id) : Promise.resolve(null),
  ]);

  const counts = Object.fromEntries(
    BUCKETS.map((b) => [b.id, conversations.filter((c) => c.bucket === b.id).length])
  ) as Record<InboxBucket, number>;

  // Por defecto se abre donde hay trabajo: si nadie espera, se ve todo.
  const selected = (BUCKETS.find((b) => b.id === searchParams.b)?.id ?? null) as InboxBucket | null;
  const rows = selected ? conversations.filter((c) => c.bucket === selected) : conversations;
  const current = BUCKETS.find((b) => b.id === selected);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Asistente</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Conversaciones de WhatsApp y simulador de pruebas.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <AutoRefresh seconds={20} />
          {counts.ayuda > 0 && (
            <Link href="/whatsapp?b=ayuda">
              <Badge tone="warning" className="cursor-pointer px-3 py-1">
                {counts.ayuda} esperan a una persona
              </Badge>
            </Link>
          )}
        </div>
      </div>

      {/* Segmentos */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {BUCKETS.map((b) => {
          const Icon = b.icon;
          const n = counts[b.id];
          const on = selected === b.id;
          const urgent = b.id === "ayuda" && n > 0;
          return (
            <Link
              key={b.id}
              href={on ? "/whatsapp" : `/whatsapp?b=${b.id}`}
              className={cn(
                "rounded-xl border bg-card p-4 shadow-card transition-colors",
                on ? "border-primary" : urgent ? "border-amber-300" : "border-border hover:border-primary/40"
              )}
              title={b.hint}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-medium text-muted-foreground">{b.label}</span>
                <Icon className={cn("h-4 w-4", urgent ? "text-amber-600" : "text-muted-foreground/60")} />
              </div>
              <p className={cn("mt-1 text-2xl font-bold", urgent ? "text-amber-600" : "text-navy")}>{n}</p>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          {active ? (
            <ConversationPanel
              sessionId={active.id}
              phone={active.phone}
              phoneMasked={`•••• ${active.phone.slice(-4)}`}
              patientName={active.patient ? `${active.patient.firstName} ${active.patient.lastLastName}` : null}
              status={active.status}
              messages={active.messages.map((m) => ({
                id: m.id,
                direction: m.direction,
                body: m.body,
                options: (m.optionsJson as string[] | null) ?? [],
                createdAt: m.createdAt.toISOString(),
              }))}
            />
          ) : (
            <Simulator phone={phone} />
          )}
        </div>

        {/* Bandeja */}
        <Card className="h-fit">
          <div className="flex items-center justify-between border-b border-border p-4">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-base font-semibold text-navy">
                <Inbox className="h-4 w-4" />
                {current?.label ?? "Todas"} ({rows.length})
              </p>
              {current && <p className="mt-0.5 text-xs text-muted-foreground">{current.hint}</p>}
            </div>
            {(selected || active) && (
              <Link href="/whatsapp" className="shrink-0 text-[13px] font-medium text-primary hover:underline">
                {selected ? "Ver todas" : "Simulador"}
              </Link>
            )}
          </div>

          <CardContent className="p-0">
            {rows.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground/40" />
                <p className="mt-2 text-sm text-muted-foreground">
                  {conversations.length === 0
                    ? "Aún no hay conversaciones. Escribe en el simulador para empezar."
                    : "Nada en este segmento."}
                </p>
              </div>
            ) : (
              <ul className="max-h-[560px] divide-y divide-border overflow-y-auto">
                {rows.map((r) => (
                  <Row key={r.id} r={r} active={searchParams.id === r.id} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
