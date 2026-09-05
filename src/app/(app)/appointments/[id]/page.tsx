import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/rbac";
import { getAppointmentById } from "@/lib/services/appointments";
import { getClinicTimezone } from "@/lib/services/organizations";
import { hoyEnZona } from "@/lib/utils/timezone";
import { calculateAge } from "@/lib/utils/age";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TimeSelect } from "../time-select";
import { SendPreRegButton } from "@/app/(app)/waiting-room/send-prereg-button";
import {
  confirmAppointmentAction,
  cancelAppointmentAction,
  rescheduleAppointmentAction,
  markNoShowAction,
} from "@/lib/actions/appointments";
import { registerArrivalAction } from "@/lib/actions/visits";
import { ensureAppointmentPreRegAction } from "@/lib/actions/preregistration";

/**
 * LA CITA.
 *
 * Antes, hacer clic en una cita de la agenda te sacaba al expediente del
 * paciente: la cita no tenía pantalla propia en ningún lado, así que confirmar,
 * reagendar, cancelar o reenviar el prerregistro solo se podía desde la sala de
 * espera, y solo el mismo día.
 *
 * Esta pantalla no inventa reglas: llama a las acciones que ya existían
 * (`confirmAppointmentAction`, `rescheduleAppointmentAction`,
 * `cancelAppointmentAction`, `registerArrivalAction`), varias de las cuales
 * estaban escritas y sin usar por no tener dónde vivir.
 */

const STATUS: Record<string, { label: string; tone: "default" | "info" | "success" | "warning" | "danger" }> = {
  TO_CONFIRM: { label: "Por confirmar", tone: "warning" },
  CONFIRMED: { label: "Confirmada", tone: "info" },
  ARRIVED: { label: "En sala", tone: "info" },
  WAITING: { label: "En espera", tone: "info" },
  IN_CONSULTATION: { label: "En consulta", tone: "info" },
  COMPLETED: { label: "Atendida", tone: "success" },
  CANCELLED: { label: "Cancelada", tone: "danger" },
  NO_SHOW: { label: "No asistió", tone: "danger" },
  RESCHEDULED: { label: "Reprogramada", tone: "default" },
};

const TYPE_LABEL: Record<string, string> = {
  FIRST_TIME: "Primera vez",
  FOLLOW_UP: "Seguimiento",
  EXISTING_PATIENT: "Cita médica",
};

export default async function AppointmentPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return null;

  const cita = await getAppointmentById(session.organizationId, params.id);
  if (!cita) notFound();

  const tz = await getClinicTimezone(session.organizationId);
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const inicio = new Date(cita.startTime);
  const fechaStr = inicio.toISOString().slice(0, 10);
  const hora = String(inicio.getHours()).padStart(2, "0");
  const minuto = String(inicio.getMinutes()).padStart(2, "0");
  const esHoy = fechaStr === hoyEnZona(tz);

  const cerrada = ["CANCELLED", "COMPLETED", "NO_SHOW", "RESCHEDULED"].includes(cita.status);
  const puedeAgendar = hasPermission(session.role, "MANAGE_APPOINTMENTS");
  const puedeRecibir = hasPermission(session.role, "REGISTER_ARRIVAL");

  // Prerregistro: igual que en la sala de espera y en el expediente. Un token
  // vencido no sirve para reenviar — el paciente vería "el enlace expiró".
  const token = cita.publicFormTokens[0];
  const preRegDone = !!token && (token.status === "SUBMITTED" || token.status === "CONVERTED");
  const preRegVivo = !!token && token.status !== "REVOKED" && token.expiresAt > new Date();
  const preRegUrl = preRegVivo ? `${base}/public/prerregistro/${token.token}` : null;
  const necesitaPreReg = (!!token || cita.type === "FIRST_TIME") && !preRegDone && !cerrada;

  const consulta = cita.visit?.consultation ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href={`/appointments?view=day&date=${fechaStr}`} className="text-sm text-primary hover:underline">
          ← Volver a la agenda
        </Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">
              {cita.patient.firstName} {cita.patient.lastLastName} {cita.patient.secondLastName ?? ""}
            </h1>
            <p className="text-sm text-muted-foreground">
              {inicio.toLocaleDateString("es-MX", { dateStyle: "full" })} ·{" "}
              {inicio.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })} ·{" "}
              {cita.durationMinutes} min
            </p>
          </div>
          <Badge tone={STATUS[cita.status]?.tone ?? "default"}>{STATUS[cita.status]?.label ?? cita.status}</Badge>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Datos de la cita</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <Dato label="Expediente" valor={cita.patient.recordNumber} />
          <Dato label="Edad" valor={`${calculateAge(cita.patient.birthDate)} años`} />
          <Dato label="Médico" valor={`Dr(a). ${cita.doctor.fullName}`} />
          <Dato label="Tipo" valor={TYPE_LABEL[cita.type] ?? cita.type} />
          <Dato label="Teléfono" valor={cita.patient.phone || "Sin registro"} />
          <Dato label="Folio" valor={cita.folio || "—"} />
          <div className="sm:col-span-2">
            <Dato label="Motivo" valor={cita.reason || "Sin motivo capturado"} />
          </div>
          {cita.isOverbooked && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 sm:col-span-2">
              Sobrecupo autorizado por el médico.
            </p>
          )}
          <div className="sm:col-span-2">
            <Link href={`/patients/${cita.patientId}`} className="text-sm font-medium text-primary hover:underline">
              Ver expediente completo →
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* PRERREGISTRO — el enlace vive aquí, donde está la cita. */}
      {necesitaPreReg && (
        <Card className="border-amber-300 bg-amber-50">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-amber-900">Prerregistro pendiente</CardTitle>
              <p className="text-sm text-amber-800">
                {preRegUrl
                  ? "El paciente aún no llena su historia clínica."
                  : token
                    ? "El enlace anterior venció. Genera uno nuevo para reenviarlo."
                    : "Este paciente todavía no tiene enlace."}
              </p>
            </div>
            {preRegUrl ? (
              <SendPreRegButton
                url={preRegUrl}
                patientName={cita.patient.firstName}
                phone={cita.patient.phone}
              />
            ) : (
              <form action={ensureAppointmentPreRegAction}>
                <input type="hidden" name="appointmentId" value={cita.id} />
                <input type="hidden" name="patientId" value={cita.patientId} />
                <Button type="submit" size="sm" variant="secondary">
                  {token ? "Renovar enlace" : "Generar enlace"}
                </Button>
              </form>
            )}
          </CardHeader>
        </Card>
      )}

      {preRegDone && (
        <p className="rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800">
          ✓ El paciente ya envió su prerregistro.
        </p>
      )}

      {/* ACCIONES — solo mientras la cita siga viva. */}
      {!cerrada && (
        <Card>
          <CardHeader><CardTitle>Acciones</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {puedeAgendar && cita.status === "TO_CONFIRM" && (
              <form action={confirmAppointmentAction.bind(null, cita.id)}>
                <Button type="submit" size="sm" variant="success">Confirmar cita</Button>
              </form>
            )}

            {/* Pasar a consulta solo el día de la cita: recibir a alguien que
                viene el jueves adelantaría su expediente sin que haya llegado. */}
            {puedeRecibir && esHoy && !cita.visit && (
              <form action={registerArrivalAction}>
                <input type="hidden" name="appointmentId" value={cita.id} />
                <Button type="submit" size="sm">Registrar llegada</Button>
              </form>
            )}

            {cita.visit && !consulta && (
              <Link href="/waiting-room" className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-[13px] font-semibold hover:bg-muted">
                Ya está en sala — ir a la sala de espera
              </Link>
            )}

            {consulta && (
              <Link href={`/consultations/${consulta.id}`} className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-[13px] font-semibold text-primary-foreground hover:opacity-90">
                Ver la consulta
              </Link>
            )}

            {puedeAgendar && esHoy && !cita.visit && (
              <form action={markNoShowAction.bind(null, cita.id)}>
                <Button type="submit" size="sm" variant="ghost">Marcar no asistió</Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {puedeAgendar && !cerrada && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Reprogramar</CardTitle></CardHeader>
            <CardContent>
              <form action={rescheduleAppointmentAction} className="space-y-3">
                <input type="hidden" name="appointmentId" value={cita.id} />
                <input type="hidden" name="durationMinutes" value={cita.durationMinutes} />
                <div>
                  <Label htmlFor="rd" required>Nueva fecha</Label>
                  <Input id="rd" name="scheduledDate" type="date" defaultValue={fechaStr} required />
                </div>
                <div>
                  <Label required>Nueva hora</Label>
                  <TimeSelect defaultHour={hora} defaultMinute={minuto} />
                </div>
                <div>
                  <Label htmlFor="rr">Motivo del cambio</Label>
                  <Input id="rr" name="reason" placeholder="El paciente lo pidió" />
                </div>
                <Button type="submit" size="sm" variant="secondary">Reprogramar</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Cancelar</CardTitle></CardHeader>
            <CardContent>
              {/* Cancelar NO borra: la cita queda con su historial y su motivo.
                  Un hueco en la agenda sin explicación no le sirve a nadie. */}
              <form action={cancelAppointmentAction} className="space-y-3">
                <input type="hidden" name="appointmentId" value={cita.id} />
                <div>
                  <Label htmlFor="cr">Motivo de la cancelación</Label>
                  <Textarea id="cr" name="reason" rows={3} placeholder="Quién canceló y por qué" />
                </div>
                <Button type="submit" size="sm" variant="destructive">Cancelar cita</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {cita.statusHistory.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Historial de la cita</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {cita.statusHistory.map((h) => (
              <div key={h.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0">
                <span>
                  {h.fromStatus ? `${STATUS[h.fromStatus]?.label ?? h.fromStatus} → ` : ""}
                  <strong>{STATUS[h.toStatus]?.label ?? h.toStatus}</strong>
                  {h.reason && <span className="text-muted-foreground"> · {h.reason}</span>}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(h.createdAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-medium">{valor}</p>
    </div>
  );
}
