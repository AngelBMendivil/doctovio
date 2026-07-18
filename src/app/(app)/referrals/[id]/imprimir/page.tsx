import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getLetterhead } from "@/lib/services/letterhead";
import { calculateAge } from "@/lib/utils/age";
import { PrintButton } from "@/app/(app)/prescriptions/[id]/print-button";
import { ReferralDocument, type ReferralDocProps } from "../referral-document";

const SEX: Record<string, string> = { MALE: "Masculino", FEMALE: "Femenino", UNDETERMINED: "" };

const PRIORITY: Record<string, string> = { NORMAL: "Normal", HIGH: "Alta", URGENT: "Urgente" };

const STATUS: Record<string, string> = {
  DRAFT: "Borrador",
  SENT: "Enviada",
  RECEIVED: "Recibida",
  ACCEPTED: "Aceptada",
  REJECTED: "Rechazada",
  ATTENDED: "Atendida",
  CLOSED: "Cerrada",
  CANCELLED: "Cancelada",
  EXPIRED: "Expirada",
};

export default async function ReferralPrintPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { size?: string };
}) {
  const session = await getSession();
  if (!session) return null;

  const referral = await db.medicalReferral.findUnique({
    where: { id: params.id },
    include: {
      patient: true,
      sharedItems: true,
      toDoctor: { include: { doctorProfile: true } },
      organizationTo: true,
    },
  });
  if (!referral) notFound();

  // Solo el médico que la envió o el que la recibe pueden imprimirla.
  const isParty = referral.fromDoctorId === session.userId || referral.toDoctorId === session.userId;
  if (!isParty) notFound();

  // El membrete es el de quien EMITE la solicitud (el médico referente).
  const lh = await getLetterhead(referral.organizationFromId, referral.fromDoctorId);

  const paperSize: "full" | "half" =
    searchParams.size === "half" ? "half" : searchParams.size === "full" ? "full" : lh.cfg.paperSize;

  const props: ReferralDocProps = {
    lh,
    folio: `REF-${referral.id.slice(-6).toUpperCase()}`,
    dateStr: new Date(referral.sentAt ?? referral.createdAt).toLocaleDateString("es-MX", { dateStyle: "long" }),
    paperSize,
    statusLabel: STATUS[referral.status] ?? referral.status,
    isVoid: ["CANCELLED", "REJECTED", "EXPIRED"].includes(referral.status),
    patientName: `${referral.patient.firstName} ${referral.patient.lastLastName} ${referral.patient.secondLastName ?? ""}`.trim(),
    age: calculateAge(referral.patient.birthDate),
    sexLabel: SEX[referral.patient.sex] ?? "",
    dob: new Date(referral.patient.birthDate).toLocaleDateString("es-MX"),
    toDoctorName: referral.toDoctor.fullName,
    toDoctorSpecialty: referral.toDoctor.doctorProfile?.specialty ?? "",
    toOrganization: referral.organizationTo.name,
    priorityLabel: PRIORITY[referral.priority] ?? referral.priority,
    isUrgent: referral.priority !== "NORMAL",
    reason: referral.reason,
    comments: referral.referentComments ?? "",
    sharedItems: referral.sharedItems.map((i) => ({
      id: i.id,
      fieldLabel: i.fieldLabel,
      valueText: i.valueText,
    })),
    patientAuthorized: referral.patientAuthorized,
  };

  const tab = (size: "full" | "half", label: string) => (
    <Link
      href={`/referrals/${referral.id}/imprimir?size=${size}`}
      className={`rounded px-2 py-1 ${
        paperSize === size ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/referrals/${referral.id}`} className="text-sm text-primary hover:underline">
          ← Volver a la referencia
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-md border border-border p-0.5 text-xs">
            {tab("full", "Hoja completa")}
            {tab("half", "Media hoja")}
          </div>
          <PrintButton />
        </div>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: paperSize === "half" ? "@page{size:5.5in 8.5in;margin:10mm}" : "@page{size:letter;margin:14mm}",
        }}
      />
      <ReferralDocument {...props} />
    </div>
  );
}
