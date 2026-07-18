import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getConsultationForPayment } from "@/lib/services/billing";
import { calculateAge } from "@/lib/utils/age";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PaymentFlow } from "./payment-flow";

const METHOD: Record<string, string> = { CASH: "Efectivo", TRANSFER: "Transferencia", CARD: "Tarjeta", OTHER: "Otro" };

export default async function PaymentDetailPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return null;

  const data = await getConsultationForPayment(session.organizationId, params.id);
  if (!data) notFound();

  const { consultation, basePriceMxn, basePriceUsd, currency, insurers, patientInsurerId } = data;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">
            Cobro — {consultation.patient.firstName} {consultation.patient.lastLastName}
          </h1>
          <p className="text-sm text-muted-foreground">
            {calculateAge(consultation.patient.birthDate)} años · Dr(a). {consultation.doctor.fullName}
          </p>
        </div>
        <Link href="/payments" className="text-sm text-primary hover:underline">← Volver</Link>
      </div>

      <Card>
        <CardHeader><CardTitle>Registrar pago</CardTitle></CardHeader>
        <CardContent>
          {consultation.payment ? (
            <div className="space-y-2 text-sm">
              <p className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-green-800">
                Esta consulta ya fue cobrada.
              </p>
              <p><b>Monto:</b> {consultation.payment.amount} {consultation.payment.currency}</p>
              <p><b>Método:</b> {METHOD[consultation.payment.method] ?? consultation.payment.method}</p>
              <p>
                <b>Origen:</b>{" "}
                {consultation.payment.origin === "INSURANCE"
                  ? `Aseguranza${consultation.payment.insurerName ? ` — ${consultation.payment.insurerName}` : ""}`
                  : "Privado"}
              </p>
              {consultation.payment.reference && <p><b>Referencia:</b> {consultation.payment.reference}</p>}
            </div>
          ) : (
            <PaymentFlow
              consultationId={consultation.id}
              patientId={consultation.patientId}
              doctorId={consultation.doctorId}
              patientName={`${consultation.patient.firstName} ${consultation.patient.lastLastName}`}
              basePriceMxn={basePriceMxn}
              basePriceUsd={basePriceUsd}
              defaultCurrency={currency}
              defaultDate={today}
              insurers={insurers}
              patientInsurerId={patientInsurerId}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
