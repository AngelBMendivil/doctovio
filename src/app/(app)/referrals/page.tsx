import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { listInboxReferrals, listSentReferrals, SHAREABLE_FIELDS } from "@/lib/services/referrals";
import { searchDirectory } from "@/lib/services/directory";
import { listPatients } from "@/lib/services/patients";
import { sendReferralAction } from "@/lib/actions/referrals";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const STATUS_TONE: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  DRAFT: "default",
  SENT: "info",
  RECEIVED: "info",
  ACCEPTED: "success",
  REJECTED: "danger",
  ATTENDED: "success",
  CLOSED: "default",
  CANCELLED: "danger",
  EXPIRED: "warning",
};

export default async function ReferralsPage() {
  const session = await getSession();
  if (!session) return null;
  if (session.role === "ASSISTANT") {
    return <p className="text-sm text-muted-foreground">Los asistentes no tienen acceso a referencias médicas.</p>;
  }

  const [inbox, sent, directory, patientsResult] = await Promise.all([
    listInboxReferrals(session.userId),
    listSentReferrals(session.userId),
    searchDirectory({ onlyAcceptsReferrals: true }),
    listPatients(session.organizationId, { pageSize: 200 }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Referencias médicas</h1>

      <Card>
        <CardHeader><CardTitle>Referir paciente</CardTitle></CardHeader>
        <CardContent>
          <form action={sendReferralAction} className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label>Paciente</Label>
              <Select name="patientId" required>
                <option value="">Selecciona...</option>
                {patientsResult.items.map((p) => (
                  <option key={p.id} value={p.id}>{p.firstName} {p.lastLastName} · {p.recordNumber}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Médico receptor</Label>
              <Select name="toDoctorId" required>
                <option value="">Selecciona...</option>
                {directory.map((d) => (
                  <option key={d.id} value={d.userId}>
                    {d.user.fullName} · {d.specialty || "General"} · {d.organization.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Motivo de la referencia</Label>
              <Textarea name="reason" required />
            </div>
            <div>
              <Label>Diagnóstico relacionado</Label>
              <Input name="diagnosisText" />
            </div>
            <div>
              <Label>Tratamiento actual</Label>
              <Input name="treatmentText" />
            </div>
            <div className="md:col-span-2">
              <Label>Estudios recomendados</Label>
              <Input name="studiesText" />
            </div>
            <div className="md:col-span-2">
              <Label>Comentarios del médico referente</Label>
              <Textarea name="referentComments" />
            </div>
            <div>
              <Label>Prioridad</Label>
              <Select name="priority" defaultValue="NORMAL">
                <option value="NORMAL">Normal</option>
                <option value="HIGH">Alta</option>
                <option value="URGENT">Urgente</option>
              </Select>
            </div>
            <div>
              <Label>Vigencia del acceso (días)</Label>
              <Input name="accessDays" type="number" defaultValue={30} min={1} max={180} />
            </div>

            <div className="md:col-span-2">
              <Label>Información clínica a compartir (selecciona lo autorizado)</Label>
              <div className="grid grid-cols-2 gap-2 rounded-md border border-border p-3 md:grid-cols-3">
                {Object.entries(SHAREABLE_FIELDS).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="sharedFieldKeys" value={key} defaultChecked={["name", "age", "sex", "diagnosis", "reason"].includes(key)} />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div className="md:col-span-2 flex items-center gap-2">
              <input type="checkbox" name="patientAuthorized" required id="patientAuthorized" />
              <Label htmlFor="patientAuthorized" className="mb-0">
                El paciente autorizó compartir esta información con el médico receptor
              </Label>
            </div>

            <div className="md:col-span-2">
              <Button type="submit">Enviar referencia</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Recibidas ({inbox.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {inbox.map((r) => (
              <Link key={r.id} href={`/referrals/${r.id}`} className="block rounded-md border border-border p-2 text-sm hover:bg-muted/30">
                <div className="flex items-center justify-between">
                  <span>{r.patient.firstName} {r.patient.lastLastName} · Dr(a). {r.fromDoctor.fullName}</span>
                  <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                </div>
              </Link>
            ))}
            {inbox.length === 0 && <p className="text-sm text-muted-foreground">Sin referencias recibidas.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Enviadas ({sent.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {sent.map((r) => (
              <Link key={r.id} href={`/referrals/${r.id}`} className="block rounded-md border border-border p-2 text-sm hover:bg-muted/30">
                <div className="flex items-center justify-between">
                  <span>{r.patient.firstName} {r.patient.lastLastName} · Dr(a). {r.toDoctor.fullName}</span>
                  <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                </div>
              </Link>
            ))}
            {sent.length === 0 && <p className="text-sm text-muted-foreground">Sin referencias enviadas.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
