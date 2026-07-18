import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getPrescriptionForPrint, getOrCreateShareToken } from "@/lib/services/prescriptions";
import { getLetterhead } from "@/lib/services/letterhead";
import { cancelPrescriptionAction } from "@/lib/actions/prescriptions";
import { calculateAge } from "@/lib/utils/age";
import { PrescriptionDocument, type PrescriptionDocProps } from "./prescription-document";
import { PrintButton } from "./print-button";
import { SharePrescription } from "./share-prescription";
import { Button } from "@/components/ui/button";

const SEX: Record<string, string> = { MALE: "Masculino", FEMALE: "Femenino", UNDETERMINED: "" };
const STATUS: Record<string, string> = {
  DRAFT: "Borrador",
  ISSUED: "Emitida",
  CANCELLED: "Cancelada",
  SUPERSEDED: "Reemplazada",
};

export default async function PrescriptionPrintPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { size?: string };
}) {
  const session = await getSession();
  if (!session) return null;

  const rx = await getPrescriptionForPrint(session.organizationId, params.id);
  if (!rx) notFound();

  const [lh, token] = await Promise.all([
    getLetterhead(session.organizationId, rx.doctorId),
    getOrCreateShareToken(session.organizationId, params.id),
  ]);

  const paperSize: "full" | "half" =
    searchParams.size === "half" ? "half" : searchParams.size === "full" ? "full" : lh.cfg.paperSize;

  const diagnosis =
    rx.diagnosisText ||
    (rx.consultation?.diagnoses ?? []).map((dx) => `${dx.label}${dx.code ? ` (${dx.code})` : ""}`).join("; ");

  const props: PrescriptionDocProps = {
    lh,
    folio: rx.folio,
    dateStr: new Date(rx.issuedAt ?? rx.date).toLocaleDateString("es-MX", { dateStyle: "long" }),
    dob: new Date(rx.patient.birthDate).toLocaleDateString("es-MX"),
    paperSize,
    statusLabel: STATUS[rx.status] ?? rx.status,
    isVoid: rx.status === "CANCELLED" || rx.status === "SUPERSEDED",
    replacesFolio: rx.supersedes?.folio ?? undefined,
    replacedByFolio: rx.supersededBy?.folio ?? undefined,
    patientName: `${rx.patient.firstName} ${rx.patient.lastLastName} ${rx.patient.secondLastName ?? ""}`.trim(),
    age: calculateAge(rx.patient.birthDate),
    sexLabel: SEX[rx.patient.sex] ?? "",
    allergies: rx.patient.allergies.map((a) => a.substance).join(", "),
    allergiesNegated: rx.patient.medicalProfile?.allergiesNegated ?? false,
    diagnosis,
    items: rx.items,
    generalInstructions: rx.instructions ?? "",
    recommendations: rx.recommendations ?? "",
  };

  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const shareUrl = `${base}/public/receta/${token}`;
  const canCancel = (session.role === "ADMIN" || session.role === "DOCTOR") && rx.status === "ISSUED";

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        {/* Si la receta salió de una consulta, se vuelve A LA CONSULTA: el
            médico sigue en medio de la atención, no quiere ir al expediente. */}
        <Link
          href={rx.consultationId ? `/consultations/${rx.consultationId}?tab=receta` : `/patients/${rx.patientId}`}
          className="text-sm text-primary hover:underline"
        >
          {rx.consultationId ? "← Volver a la consulta" : "← Volver al expediente"}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-md border border-border p-0.5 text-xs">
            <Link
              href={`/prescriptions/${rx.id}?size=full`}
              className={`rounded px-2 py-1 ${paperSize === "full" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Hoja completa
            </Link>
            <Link
              href={`/prescriptions/${rx.id}?size=half`}
              className={`rounded px-2 py-1 ${paperSize === "half" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Media hoja
            </Link>
          </div>
          <SharePrescription url={shareUrl} patientName={props.patientName} phone={rx.patient.phone} />
          {canCancel && (
            <form action={cancelPrescriptionAction.bind(null, rx.id)}>
              <Button type="submit" size="sm" variant="ghost" className="text-red-600 hover:bg-red-50">
                Cancelar receta
              </Button>
            </form>
          )}
          <PrintButton />
        </div>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html:
            paperSize === "half" ? "@page{size:5.5in 8.5in;margin:10mm}" : "@page{size:letter;margin:14mm}",
        }}
      />
      <PrescriptionDocument {...props} />
    </div>
  );
}
