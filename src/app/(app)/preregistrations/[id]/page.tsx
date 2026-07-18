import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { getPreRegistrationById } from "@/lib/services/preregistration";
import type { PreRegistrationPayload } from "@/lib/validations/preregistration";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { convertPreRegistrationAction } from "@/lib/actions/preregistration";

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="whitespace-pre-line text-sm">{value && value.trim() ? value : "—"}</p>
    </div>
  );
}

const yesNo = (v?: boolean) => (v ? "Sí" : "No");

const MARITAL: Record<string, string> = {
  SINGLE: "Soltero(a)", MARRIED: "Casado(a)", DIVORCED: "Divorciado(a)",
  WIDOWED: "Viudo(a)", FREE_UNION: "Unión libre", OTHER: "Otro",
};
const SEX: Record<string, string> = { MALE: "Masculino", FEMALE: "Femenino", UNDETERMINED: "Sin especificar" };

export default async function PreRegistrationDetailPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return null;

  const t = await getPreRegistrationById(session.organizationId, params.id);
  if (!t || !t.payloadJson) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-sm text-muted-foreground">Prerregistro no encontrado o sin datos.</p>
        <Link href="/preregistrations" className="text-sm text-primary underline">Volver</Link>
      </div>
    );
  }

  const p = t.payloadJson as unknown as PreRegistrationPayload;
  const alreadyConverted = t.status === "CONVERTED";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">
            {p.firstName} {p.lastName1} {p.lastName2 ?? ""}
          </h1>
          <p className="text-sm text-muted-foreground">Prerregistro enviado por el paciente</p>
        </div>
        <Link href="/preregistrations" className="text-sm text-primary underline">Volver</Link>
      </div>

      <Card>
        <CardHeader><CardTitle>Datos personales</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Field label="Nombre" value={`${p.firstName} ${p.lastName1} ${p.lastName2 ?? ""}`} />
          <Field label="Fecha de nacimiento" value={p.birthDate} />
          <Field label="Sexo" value={SEX[p.sex] ?? p.sex} />
          <Field label="Teléfono" value={p.phone} />
          <Field label="Correo" value={p.email} />
          <Field label="Ocupación" value={p.occupation} />
          <Field label="Estado civil" value={p.maritalStatus ? MARITAL[p.maritalStatus] : ""} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Domicilio y contacto de emergencia</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Field label="Dirección" value={p.address} />
          <Field label="País" value={p.country} />
          <Field label="Estado" value={p.state} />
          <Field label="Ciudad" value={p.city} />
          <Field label="Código postal" value={p.postalCode} />
          <Field label="Contacto de emergencia" value={p.emergencyContactName} />
          <Field label="Parentesco" value={p.emergencyContactRelationship} />
          <Field label="Teléfono de emergencia" value={p.emergencyContactPhone} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Alergias, enfermedades crónicas y medicación</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Alergias" value={p.allergies} />
          <Field label="Enfermedades crónicas" value={p.chronicConditions} />
          <Field label="Medicamentos actuales" value={p.currentMedications} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Antecedentes heredofamiliares</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Field label="Diabetes" value={yesNo(p.familyDiabetes)} />
          <Field label="Hipertensión" value={yesNo(p.familyHypertension)} />
          <Field label="Cáncer" value={yesNo(p.familyCancer)} />
          <Field label="Enf. del corazón" value={yesNo(p.familyHeartDisease)} />
          <Field label="Enf. hereditaria" value={yesNo(p.familyHereditaryDisease)} />
          <Field label="Cáncer (tipos)" value={p.familyCancerTypes} />
          <Field label="Otros" value={p.familyOthers} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Antecedentes personales / estilo de vida</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Field label="Tabaquismo" value={p.smoking} />
          <Field label="Alcohol" value={p.alcohol} />
          <Field label="Actividad física" value={p.exercise} />
          <Field label="Otras sustancias" value={p.substanceUse} />
          <Field label="Cirugías previas" value={p.surgeriesNotes} />
          <Field label="Hospitalizaciones" value={p.hospitalizationsNotes} />
          <Field label="Enfermedades importantes" value={p.priorDiseases} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between pt-6">
          {alreadyConverted ? (
            <p className="text-sm text-green-700">Este prerregistro ya fue convertido en expediente.</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Al convertir se crea el expediente del paciente con estos datos.
              </p>
              <form action={convertPreRegistrationAction}>
                <input type="hidden" name="id" value={t.id} />
                <Button type="submit">Convertir a expediente</Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
