import Link from "next/link";
import { Printer } from "lucide-react";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getReferralSummaryForReceiver } from "@/lib/services/referrals";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  acceptReferralAction,
  rejectReferralAction,
  submitReferralResponseAction,
  closeReferralAction,
} from "@/lib/actions/referrals";

export default async function ReferralDetailPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return null;

  const base = await db.medicalReferral.findUnique({ where: { id: params.id } });
  if (!base) notFound();

  const isReceiver = base.toDoctorId === session.userId;
  const isSender = base.fromDoctorId === session.userId;
  if (!isReceiver && !isSender) notFound();

  if (isReceiver) {
    const referral = await getReferralSummaryForReceiver(params.id, session.userId);
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Referencia recibida</h1>
          <div className="flex items-center gap-3">
            <Badge>{referral.status}</Badge>
            <Link href={`/referrals/${referral.id}/imprimir`}>
              <Button variant="outline" size="sm">
                <Printer className="h-4 w-4" />
                Imprimir solicitud
              </Button>
            </Link>
          </div>
        </div>

        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="text-sm text-blue-900">
            Solo puedes ver la información clínica que el médico referente autorizó compartir. El expediente completo
            del paciente permanece en su organización de origen.
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Médico referente</CardTitle></CardHeader>
          <CardContent className="text-sm">
            <p>{referral.fromDoctor.fullName} · {referral.fromDoctor.doctorProfile?.specialty || "—"}</p>
            <p className="text-muted-foreground">{referral.organizationFrom.name}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Resumen clínico autorizado</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {referral.sharedItems.map((item) => (
              <p key={item.id}><b>{item.fieldLabel}:</b> {item.valueText}</p>
            ))}
            <p className="pt-2"><b>Motivo:</b> {referral.reason}</p>
            {referral.referentComments && <p><b>Comentarios:</b> {referral.referentComments}</p>}
          </CardContent>
        </Card>

        {referral.status === "SENT" && (
          <div className="flex gap-2">
            <form action={acceptReferralAction.bind(null, referral.id)}>
              <Button type="submit">Aceptar</Button>
            </form>
            <form action={rejectReferralAction.bind(null, referral.id)}>
              <Button type="submit" variant="outline">Rechazar</Button>
            </form>
          </div>
        )}

        {referral.status === "ACCEPTED" && !referral.response && (
          <Card>
            <CardHeader><CardTitle>Responder referencia</CardTitle></CardHeader>
            <CardContent>
              <form action={submitReferralResponseAction} className="space-y-3">
                <input type="hidden" name="referralId" value={referral.id} />
                <div className="flex items-center gap-2">
                  <input type="checkbox" name="attendedConfirmed" id="attendedConfirmed" defaultChecked />
                  <Label htmlFor="attendedConfirmed" className="mb-0">Confirmo que atendí al paciente</Label>
                </div>
                <div><Label>Evaluación general</Label><Textarea name="generalAssessment" /></div>
                <div><Label>Diagnóstico general</Label><Textarea name="generalDiagnosis" /></div>
                <div><Label>Recomendaciones</Label><Textarea name="recommendations" /></div>
                <div><Label>Seguimiento</Label><Textarea name="followUp" /></div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" name="requestsReturn" id="requestsReturn" />
                  <Label htmlFor="requestsReturn" className="mb-0">Solicito que el paciente regrese con el médico referente</Label>
                </div>
                <Button type="submit">Enviar respuesta</Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // Vista del médico que envió la referencia
  const referral = await db.medicalReferral.findUniqueOrThrow({
    where: { id: params.id },
    include: { patient: true, toDoctor: { include: { doctorProfile: true } }, response: true, sharedItems: true },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Referencia enviada</h1>
        <div className="flex items-center gap-3">
          <Badge>{referral.status}</Badge>
          <Link href={`/referrals/${referral.id}/imprimir`}>
            <Button variant="outline" size="sm">
              <Printer className="h-4 w-4" />
              Imprimir solicitud
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Paciente y médico receptor</CardTitle></CardHeader>
        <CardContent className="text-sm">
          <p>{referral.patient.firstName} {referral.patient.lastLastName}</p>
          <p className="text-muted-foreground">Enviado a: {referral.toDoctor.fullName} ({referral.toDoctor.doctorProfile?.specialty})</p>
        </CardContent>
      </Card>

      {referral.response && (
        <Card>
          <CardHeader><CardTitle>Respuesta del médico receptor</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p><b>Atendido:</b> {referral.response.attendedConfirmed ? "Sí" : "No"}</p>
            <p><b>Evaluación general:</b> {referral.response.generalAssessment || "—"}</p>
            <p><b>Diagnóstico general:</b> {referral.response.generalDiagnosis || "—"}</p>
            <p><b>Recomendaciones:</b> {referral.response.recommendations || "—"}</p>
            {referral.status !== "CLOSED" && (
              <form action={closeReferralAction.bind(null, referral.id)} className="pt-2">
                <Button type="submit" variant="outline" size="sm">Cerrar referencia</Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
