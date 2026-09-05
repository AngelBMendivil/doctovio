import { getPrescriptionByShareToken } from "@/lib/services/prescriptions";
import { getLetterhead } from "@/lib/services/letterhead";
import { getMeasurementsForDocument } from "@/lib/services/vitalSigns";
import { calculateAge } from "@/lib/utils/age";
import { PrescriptionDocument, type PrescriptionDocProps } from "@/app/(app)/prescriptions/[id]/prescription-document";
import { PrintButton } from "@/app/(app)/prescriptions/[id]/print-button";

const SEX: Record<string, string> = { MALE: "Masculino", FEMALE: "Femenino", UNDETERMINED: "" };
const STATUS: Record<string, string> = {
  DRAFT: "Borrador",
  ISSUED: "Emitida",
  CANCELLED: "Cancelada",
  SUPERSEDED: "Reemplazada",
};

export default async function PublicPrescriptionPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { size?: string };
}) {
  const rx = await getPrescriptionByShareToken(params.token);

  if (!rx || rx.status === "DRAFT") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
        <div className="max-w-md rounded-lg border border-border bg-card p-8 text-center">
          <h1 className="mb-2 text-lg font-semibold">Receta no disponible</h1>
          <p className="text-sm text-muted-foreground">El enlace no es válido o la receta ya no está disponible.</p>
        </div>
      </div>
    );
  }

  // La copia que ve el paciente tiene que ser la MISMA hoja que se imprimió:
  // si aquí faltara la talla y el peso, serían dos documentos distintos con el
  // mismo folio.
  const [lh, medidas] = await Promise.all([
    getLetterhead(rx.organizationId, rx.doctorId),
    getMeasurementsForDocument(rx.organizationId, rx.patientId, {
      consultationId: rx.consultationId,
      hasta: rx.issuedAt ?? rx.date,
    }),
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
    weightKg: medidas.weightKg,
    heightCm: medidas.heightCm,
    diagnosis,
    items: rx.items,
    generalInstructions: rx.instructions ?? "",
    recommendations: rx.recommendations ?? "",
  };

  return (
    <div className="min-h-screen bg-muted/40 px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-4xl items-center justify-end print:hidden">
        <PrintButton />
      </div>
      <style
        dangerouslySetInnerHTML={{
          __html: paperSize === "half" ? "@page{size:5.5in 8.5in;margin:10mm}" : "@page{size:letter;margin:14mm}",
        }}
      />
      <PrescriptionDocument {...props} />
    </div>
  );
}
