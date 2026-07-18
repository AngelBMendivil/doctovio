import { db } from "@/lib/db";
import { getPreRegByToken, tokenUsability } from "@/lib/services/preregistration";
import { listInsurers } from "@/lib/services/insurers";
import { PreRegistrationForm } from "./prereg-form";
import { BirthDateGate } from "./birthdate-gate";

function Message({ title, text }: { title: string; text: string }) {
  return (
    <div className="mx-auto max-w-md rounded-lg border border-border bg-card p-8 text-center">
      <h1 className="mb-2 text-xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

export default async function PreRegistrationPage({ params }: { params: { token: string } }) {
  const t = await getPreRegByToken(params.token);
  const usable = tokenUsability(t);

  const org = t ? await db.organization.findUnique({ where: { id: t.organizationId }, select: { name: true } }) : null;
  const orgName = org?.name ?? "Consultorio";

  const insurers = t && usable === "OPEN" ? await listInsurers(t.organizationId, true) : [];
  const insurerOptions = insurers.map((i) => ({ id: i.id, name: i.name }));

  // Si el enlace está ligado a un paciente (cita de primera vez), prellenamos su nombre.
  const linkedPatient =
    t && usable === "OPEN" && t.patientId
      ? await db.patient.findUnique({
          where: { id: t.patientId },
          select: {
            firstName: true,
            lastLastName: true,
            secondLastName: true,
            birthDate: true,
            phone: true,
            email: true,
          },
        })
      : null;

  // Todo lo que recepción ya capturó llega prellenado: al paciente solo se le
  // pide lo que únicamente él sabe (su historia clínica).
  const prefill = linkedPatient
    ? {
        firstName: linkedPatient.firstName,
        lastName1: linkedPatient.lastLastName,
        lastName2: linkedPatient.secondLastName ?? "",
        birthDate: linkedPatient.birthDate.toISOString().slice(0, 10),
        phone: linkedPatient.phone ?? "",
        email: linkedPatient.email ?? "",
      }
    : null;

  const form =
    usable === "OPEN" && t ? (
      <PreRegistrationForm token={t.token} orgName={orgName} insurers={insurerOptions} prefill={prefill} />
    ) : null;

  return (
    <div className="min-h-screen bg-muted/40 px-4 py-8">
      {usable === "OPEN" && t ? (
        linkedPatient ? (
          // El enlace abre un expediente: se pide la fecha de nacimiento como
          // segundo factor antes de mostrar o pedir nada clínico.
          <BirthDateGate
            expected={linkedPatient.birthDate.toISOString().slice(0, 10)}
            patientFirstName={linkedPatient.firstName}
          >
            {form}
          </BirthDateGate>
        ) : (
          form
        )
      ) : usable === "SUBMITTED" ? (
        <Message
          title="Ya recibimos tus datos"
          text="Este enlace ya fue utilizado. Si necesitas corregir algo, contacta al consultorio."
        />
      ) : usable === "EXPIRED" ? (
        <Message
          title="El enlace expiró"
          text="Por seguridad, este enlace de prerregistro caducó. Solicita uno nuevo al consultorio."
        />
      ) : (
        <Message
          title="Enlace no válido"
          text="El enlace no existe o ya no está disponible. Verifica que sea el enlace correcto o pide uno nuevo al consultorio."
        />
      )}
    </div>
  );
}
