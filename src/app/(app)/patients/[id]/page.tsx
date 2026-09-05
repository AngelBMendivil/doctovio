import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getPatientById, getPatientTimeline } from "@/lib/services/patients";
import { listPatientPrescriptions } from "@/lib/services/prescriptions";
import { listPatientMedicalOrders } from "@/lib/services/medicalOrders";
import { listPatientDocuments } from "@/lib/services/documents";
import { listInsurers } from "@/lib/services/insurers";
import { isDentalClinic } from "@/lib/services/clinic-features";
import { getOdontogramSummary } from "@/lib/services/odontogram";
import { getQuotesSummary } from "@/lib/services/quotes";
import { getPendingPreRegForPatient } from "@/lib/services/preregistration";
import { ensureAppointmentPreRegAction } from "@/lib/actions/preregistration";
import { SendPreRegButton } from "@/app/(app)/waiting-room/send-prereg-button";
import { InsuranceSection } from "./insurance-section";
import { PatientGeneralSection } from "@/app/(app)/consultations/[id]/patient-general-section";
import { calculateAge } from "@/lib/utils/age";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { logAudit } from "@/lib/services/audit";
import { uploadDocumentAction } from "@/lib/actions/documents";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export default async function PatientDetailPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return null;

  const patient = await getPatientById(session.organizationId, params.id);
  if (!patient) notFound();

  await logAudit({ organizationId: session.organizationId, userId: session.userId, action: "VIEW_RECORD", entity: "patient", entityId: patient.id });

  // El giro del consultorio decide si este expediente tiene odontograma. Para
  // un consultorio médico, esta pantalla es exactamente la de siempre.
  const dental = await isDentalClinic(session.organizationId);

  const preReg = await getPendingPreRegForPatient(session.organizationId, patient.id);
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const [timeline, prescriptions, orders, documents, insurers] = await Promise.all([
    getPatientTimeline(session.organizationId, patient.id, { incluirDental: dental }),
    listPatientPrescriptions(session.organizationId, patient.id),
    listPatientMedicalOrders(session.organizationId, patient.id),
    listPatientDocuments(session.organizationId, patient.id),
    listInsurers(session.organizationId, true),
  ]);

  const insurerOptions = insurers.map((i) => ({ id: i.id, name: i.name }));

  // Solo se consulta si hay módulo dental: un consultorio médico no paga dos
  // consultas de más en cada expediente que abre.
  const [odonto, cotizaciones] = dental
    ? await Promise.all([
        getOdontogramSummary(session.organizationId, patient.id),
        getQuotesSummary(session.organizationId, patient.id),
      ])
    : [null, null];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">
            {patient.firstName} {patient.lastLastName} {patient.secondLastName}
          </h1>
          <p className="text-sm text-muted-foreground">
            Expediente {patient.recordNumber} · {calculateAge(patient.birthDate)} años · {patient.sex}
          </p>
        </div>
        <Badge tone={patient.status === "ACTIVE" ? "success" : "default"}>{patient.status}</Badge>
      </div>

      {patient.alerts.length > 0 && (
        <Card className="border-red-300 bg-red-50">
          <CardHeader><CardTitle className="text-red-800">Alertas clínicas</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {patient.alerts.map((a) => (
              <Badge key={a.id} tone="danger">{a.type}: {a.description}</Badge>
            ))}
          </CardContent>
        </Card>
      )}

      {/*
        PRERREGISTRO PENDIENTE.

        Va aquí porque el expediente es donde se cae buscando a alguien por su
        nombre, sin tener que saber la fecha de su cita. Antes el único botón
        para reenviar el enlace vivía en la sala de espera, que va por día: con
        una cita de la semana que entra había que adivinar a qué fecha navegar.
      */}
      {preReg && (
        <Card className="border-amber-300 bg-amber-50">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-amber-900">Prerregistro pendiente</CardTitle>
              <p className="text-sm text-amber-800">
                Cita del {new Date(preReg.startTime).toLocaleDateString("es-MX", { dateStyle: "long" })}
                {preReg.vencido && " · el enlace anterior venció"}
              </p>
            </div>
            {preReg.token ? (
              <SendPreRegButton
                url={`${base}/public/prerregistro/${preReg.token}`}
                patientName={patient.firstName}
                phone={patient.phone}
              />
            ) : (
              <form action={ensureAppointmentPreRegAction}>
                <input type="hidden" name="appointmentId" value={preReg.appointmentId} />
                <input type="hidden" name="patientId" value={patient.id} />
                <Button type="submit" size="sm" variant="secondary">
                  {preReg.vencido ? "Renovar enlace" : "Generar enlace"}
                </Button>
              </form>
            )}
          </CardHeader>
        </Card>
      )}

      {/*
        ODONTOGRAMA — solo en consultorios dentales.

        Va arriba, junto a las alertas, porque en una consulta dental es lo
        primero que se abre. Es un resumen con enlace: la pantalla completa vive
        en su propia ruta para no convertir el expediente en una sola columna
        interminable.
      */}
      {dental && odonto && cotizaciones && (
        <Card id="odontograma" className="border-primary/30">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle>Odontograma</CardTitle>
            <Link
              href={`/patients/${patient.id}/odontograma`}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Abrir odontograma
            </Link>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <Resumen label="Piezas con registro" valor={odonto.piezasAnotadas} />
            <Resumen label="Hallazgos" valor={odonto.hallazgos} />
            <Resumen
              label="Tratamientos por hacer"
              valor={odonto.pendientes}
              tono={odonto.pendientes > 0 ? "warning" : undefined}
            />
            <Resumen label="Cotizaciones" valor={cotizaciones.total} />
          </CardContent>
        </Card>
      )}

      {/*
        Mismo componente que usa la consulta: lectura con botón Editar. Se
        reutiliza en vez de duplicar el formulario para que corregir un dato
        funcione igual en los dos lados. El `key` fuerza el remonte tras
        guardar, para que el formulario muestre los valores nuevos.
      */}
      <div id="datos-generales">
        <PatientGeneralSection
          key={String(patient.updatedAt)}
          data={{
            patientId: patient.id,
            recordNumber: patient.recordNumber,
            firstName: patient.firstName,
            lastName1: patient.lastLastName,
            lastName2: patient.secondLastName ?? "",
            birthDate: new Date(patient.birthDate).toISOString().slice(0, 10),
            age: calculateAge(patient.birthDate),
            sex: patient.sex,
            phone: patient.phone ?? "",
            email: patient.email ?? "",
            maritalStatus: patient.maritalStatus ?? "",
            occupation: patient.occupation ?? "",
            address: patient.address ?? "",
            city: patient.city ?? "",
            state: patient.state ?? "",
            bloodType: patient.medicalProfile?.bloodType ?? "",
            curp: patient.curp ?? "",
            allergiesText: patient.allergies.map((a) => a.substance).join(", ") || "Sin registro",
            chronicText: patient.chronicConditions.map((c) => c.name).join(", ") || "Sin registro",
            medsText: patient.currentMedications.map((m) => m.name).join(", ") || "Sin registro",
          }}
          canEdit={session.role === "ADMIN" || session.role === "DOCTOR"}
        />
      </div>

      <InsuranceSection
        patientId={patient.id}
        insurances={patient.insurances as never}
        insurers={insurerOptions}
      />

      <Card id="recetas">
        <CardHeader><CardTitle>Recetas ({prescriptions.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {prescriptions.length === 0 && <p className="text-muted-foreground">Sin recetas registradas.</p>}
          {prescriptions.map((rx) => (
            <div key={rx.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
              <span>{rx.folio} · {new Date(rx.date).toLocaleDateString("es-MX")} · Dr. {rx.doctor.fullName}</span>
              <div className="flex items-center gap-3">
                <Badge tone={rx.status === "ISSUED" ? "success" : rx.status === "CANCELLED" ? "danger" : "default"}>{rx.status}</Badge>
                <Link href={`/prescriptions/${rx.id}`} className="text-xs text-primary hover:underline">Ver / Imprimir</Link>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card id="ordenes">
        <CardHeader><CardTitle>Órdenes médicas ({orders.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {orders.length === 0 && <p className="text-muted-foreground">Sin órdenes registradas.</p>}
          {orders.map((o) => (
            <div key={o.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
              <span>{o.folio} · {o.type} · {new Date(o.date).toLocaleDateString("es-MX")}</span>
              <Badge tone={o.status === "ISSUED" ? "info" : o.status === "COMPLETED" ? "success" : "default"}>{o.status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card id="documentos">
        <CardHeader><CardTitle>Documentos ({documents.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {documents.length === 0 && <p className="text-muted-foreground">Sin documentos adjuntos.</p>}
          {documents.map((d) => (
            <div key={d.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
              <span>{d.name} · {d.category}</span>
              <span className="text-muted-foreground">{new Date(d.uploadedAt).toLocaleDateString("es-MX")}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card id="subir-documento">
        <CardHeader><CardTitle>Subir documento</CardTitle></CardHeader>
        <CardContent>
          <form action={uploadDocumentAction} className="grid grid-cols-1 gap-3 md:grid-cols-2" encType="multipart/form-data">
            <input type="hidden" name="patientId" value={patient.id} />
            <div className="md:col-span-2">
              <Label htmlFor="file">Archivo (PDF, JPG, PNG)</Label>
              <input id="file" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png" required className="block w-full text-sm" />
            </div>
            <div>
              <Label htmlFor="category">Clasificación</Label>
              <Select id="category" name="category" defaultValue="ADMINISTRATIVE">
                <option value="IDENTIFICATION">Identificación</option>
                <option value="INSURANCE">Seguro</option>
                <option value="POLICY">Póliza</option>
                <option value="LAB_RESULT">Laboratorio</option>
                <option value="IMAGING">Imagenología</option>
                <option value="EXTERNAL_PRESCRIPTION">Receta externa</option>
                <option value="REFERRAL">Referencia</option>
                <option value="CONSENT">Consentimiento</option>
                <option value="ADMINISTRATIVE">Documento administrativo</option>
                <option value="CLINICAL_PHOTO">Fotografía clínica</option>
                <option value="OTHER">Otro</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="privacyLevel">Nivel de privacidad</Label>
              <Select id="privacyLevel" name="privacyLevel" defaultValue="GENERAL">
                <option value="GENERAL">General</option>
                <option value="RESTRICTED">Restringido</option>
                <option value="CONFIDENTIAL">Confidencial</option>
              </Select>
            </div>
            {/* Solo en consultorios dentales: liga la radiografía a su pieza y
                así aparece dentro del odontograma, en la historia de ese diente. */}
            {dental && (
              <div>
                <Label htmlFor="toothCode">Pieza dental (opcional)</Label>
                <Input id="toothCode" name="toothCode" maxLength={2} placeholder="16" />
                <p className="mt-1 text-xs text-muted-foreground">
                  Notación FDI. Si la escribes, el documento se ve en la historia de esa pieza.
                </p>
              </div>
            )}
            <div className="md:col-span-2">
              <Label htmlFor="description">Descripción</Label>
              <Input id="description" name="description" />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" size="sm">Subir documento</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card id="linea-de-tiempo">
        <CardHeader><CardTitle>Línea de tiempo</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {timeline.slice(0, 30).map((ev, idx) => (
            <div key={idx} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
              <span>{ev.label}</span>
              <span className="text-muted-foreground">{new Date(ev.date).toLocaleString("es-MX")}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/** Un número del resumen dental, con su etiqueta. */
function Resumen({
  label,
  valor,
  tono,
}: {
  label: string;
  valor: number;
  tono?: "warning";
}) {
  return (
    <div>
      <p className={`text-2xl font-semibold ${tono === "warning" ? "text-amber-600" : "text-navy"}`}>
        {valor}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
