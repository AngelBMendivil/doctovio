import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getConsultationDetail, getPatientHistory } from "@/lib/services/consultations";
import { getPatientById } from "@/lib/services/patients";
import { isDentalClinic } from "@/lib/services/clinic-features";
import { getOdontogram } from "@/lib/services/odontogram";
import { listActiveCatalogItems } from "@/lib/services/catalog";
import { getClinicCurrency } from "@/lib/services/organizations";
import { hasPermission } from "@/lib/auth/rbac";
import { ToothChart, type ChartTooth } from "@/components/dental/tooth-chart";
import { ToothPanel, ToothPanelEmpty } from "@/components/dental/tooth-panel";
import { allTeeth, type Dentition } from "@/lib/constants/odontograma";
import { calculateAge } from "@/lib/utils/age";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SettingsTabs } from "@/app/(app)/settings/settings-tabs";
import {
  updateConsultationAction,
  finalizeConsultationAction,
  addAddendumAction,
} from "@/lib/actions/consultations";
import { issueMedicalOrderAction } from "@/lib/actions/medicalOrders";
import { PrescriptionForm } from "./prescription-form";
import { DiagnosisForm } from "./diagnosis-form";
import { HistoryTab } from "./history-tab";
import { VitalSignsSection } from "./vital-signs-section";
import { PatientGeneralSection } from "./patient-general-section";

export default async function ConsultationDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { diente?: string; denticion?: string };
}) {
  const session = await getSession();
  if (!session) return null;

  const consultation = await getConsultationDetail(session.organizationId, params.id);
  if (!consultation) notFound();

  const [patient, history] = await Promise.all([
    getPatientById(session.organizationId, consultation.patientId),
    getPatientHistory(session.organizationId, consultation.patientId, consultation.id),
  ]);
  const isLocked = consultation.status === "COMPLETED";
  const canEditClinical = session.role === "DOCTOR" || session.role === "ADMIN";

  const latestVs = consultation.vitalSigns.length
    ? [...consultation.vitalSigns].sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())[0]
    : null;

  const patientData = {
    patientId: consultation.patientId,
    recordNumber: patient?.recordNumber ?? "",
    firstName: patient?.firstName ?? "",
    lastName1: patient?.lastLastName ?? "",
    lastName2: patient?.secondLastName ?? "",
    birthDate: patient ? new Date(patient.birthDate).toISOString().slice(0, 10) : "",
    age: patient ? calculateAge(patient.birthDate) : 0,
    sex: patient?.sex ?? "UNDETERMINED",
    phone: patient?.phone ?? "",
    email: patient?.email ?? "",
    maritalStatus: patient?.maritalStatus ?? "",
    occupation: patient?.occupation ?? "",
    address: patient?.address ?? "",
    city: patient?.city ?? "",
    state: patient?.state ?? "",
    bloodType: patient?.medicalProfile?.bloodType ?? "",
    curp: patient?.curp ?? "",
    allergiesText: patient?.allergies.map((a) => a.substance).join(", ") || "Sin registro",
    chronicText: patient?.chronicConditions.map((c) => c.name).join(", ") || "Sin registro",
    medsText: patient?.currentMedications.map((m) => m.name).join(", ") || "Sin registro",
  };

  // -------- Odontograma (solo consultorios dentales) --------
  //
  // Es el MISMO diagrama del expediente, con los mismos componentes: lo que
  // cambia es que aquí todo lo que se registra queda ligado a esta consulta.
  // Un segundo odontograma "de consulta" habría sido una segunda verdad.
  const dental = await isDentalClinic(session.organizationId);

  let odontogramaTab: React.ReactNode = null;
  if (dental && hasPermission(session.role, "VIEW_DENTAL_CHART")) {
    const dentition: Dentition = searchParams.denticion === "DECIDUOUS" ? "DECIDUOUS" : "PERMANENT";

    const [vista, catalogo, moneda] = await Promise.all([
      getOdontogram(session.organizationId, consultation.patientId),
      listActiveCatalogItems(session.organizationId),
      getClinicCurrency(session.organizationId),
    ]);

    const estados: Record<string, ChartTooth> = {};
    for (const code of allTeeth(dentition)) {
      const e = vista.estados.get(code);
      if (e) {
        estados[code] = {
          surfaces: e.surfaces,
          whole: e.whole,
          missing: e.missing,
          total: e.total,
          pendientes: e.pendientes,
        };
      }
    }

    const diente =
      searchParams.diente && allTeeth(dentition).includes(searchParams.diente) ? searchParams.diente : null;

    odontogramaTab = (
      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Lo que registres aquí queda ligado a esta consulta.
              </p>
              <div className="flex items-center gap-3 text-xs">
                <Link
                  href={`/consultations/${consultation.id}?tab=odontograma${
                    dentition === "PERMANENT" ? "&denticion=DECIDUOUS" : ""
                  }`}
                  className="text-primary hover:underline"
                >
                  Ver dentición {dentition === "PERMANENT" ? "temporal" : "permanente"}
                </Link>
                <Link
                  href={`/patients/${consultation.patientId}/odontograma`}
                  className="text-primary hover:underline"
                >
                  Plan, historial y cotizaciones →
                </Link>
              </div>
            </div>
            <ToothChart dentition={dentition} estados={estados} seleccionado={diente} />
          </CardContent>
        </Card>

        {diente ? (
          <ToothPanel
            organizationId={session.organizationId}
            patientId={consultation.patientId}
            toothCode={diente}
            catalogo={catalogo.map((c) => ({
              id: c.id,
              name: c.name,
              price: c.price,
              currency: c.currency,
              categoryName: c.category?.name ?? null,
            }))}
            canEdit={hasPermission(session.role, "EDIT_DENTAL_CHART") && !isLocked}
            canComplete={hasPermission(session.role, "MANAGE_DENTAL_TREATMENT") && !isLocked}
            canOverridePrice={hasPermission(session.role, "OVERRIDE_PRICE")}
            monedaPorOmision={moneda}
            consultationId={consultation.id}
          />
        ) : (
          <ToothPanelEmpty />
        )}
      </div>
    );
  }

  // -------- Datos generales (del expediente / prerregistro) --------
  const datosTab = (
    <PatientGeneralSection
      key={String(patient?.updatedAt ?? "x")}
      data={patientData}
      canEdit={canEditClinical}
      consultationId={consultation.id}
    />
  );

  // -------- Signos vitales --------
  const signosTab = (
    <Card>
      <CardContent className="pt-6">
        <VitalSignsSection
          key={String(latestVs?.recordedAt ?? "new")}
          consultationId={consultation.id}
          patientId={consultation.patientId}
          current={latestVs}
          canEdit={canEditClinical && !isLocked}
          locked={isLocked}
        />
      </CardContent>
    </Card>
  );

  // -------- Nota clínica --------
  const notaTab = (
    <Card>
      <CardContent className="pt-6">
        {!isLocked ? (
          <form action={updateConsultationAction} className="space-y-3">
            <input type="hidden" name="consultationId" value={consultation.id} />
            <div><Label>Padecimiento actual</Label><Textarea name="currentIllness" defaultValue={consultation.currentIllness ?? ""} /></div>
            <div><Label>Exploración física</Label><Textarea name="physicalExam" defaultValue={consultation.physicalExam ?? ""} /></div>
            <div><Label>Evaluación</Label><Textarea name="assessment" defaultValue={consultation.assessment ?? ""} /></div>
            <div><Label>Plan</Label><Textarea name="plan" defaultValue={consultation.plan ?? ""} /></div>
            <div><Label>Tratamiento</Label><Textarea name="treatment" defaultValue={consultation.treatment ?? ""} /></div>
            <div><Label>Indicaciones</Label><Textarea name="instructions" defaultValue={consultation.instructions ?? ""} /></div>
            <Button type="submit" size="sm">Guardar nota</Button>
          </form>
        ) : (
          <div className="space-y-2 text-sm">
            <p><b>Padecimiento actual:</b> {consultation.currentIllness || "—"}</p>
            <p><b>Exploración física:</b> {consultation.physicalExam || "—"}</p>
            <p><b>Evaluación:</b> {consultation.assessment || "—"}</p>
            <p><b>Plan:</b> {consultation.plan || "—"}</p>
            <p><b>Tratamiento:</b> {consultation.treatment || "—"}</p>
          </div>
        )}

        {consultation.notes.length > 0 && (
          <div className="mt-4 space-y-2 border-t border-border pt-4">
            <p className="text-sm font-medium">Notas adicionales</p>
            {consultation.notes.map((n) => (
              <p key={n.id} className="text-sm text-muted-foreground">
                {new Date(n.createdAt).toLocaleString("es-MX")}: {n.note}
              </p>
            ))}
          </div>
        )}

        <form action={addAddendumAction} className="mt-3 flex gap-2">
          <input type="hidden" name="consultationId" value={consultation.id} />
          <Input name="note" placeholder="Agregar nota adicional..." />
          <Button type="submit" size="sm" variant="outline">Agregar</Button>
        </form>
      </CardContent>
    </Card>
  );

  // -------- Diagnósticos --------
  const dxTab = (
    <Card>
      <CardContent className="space-y-3 pt-6">
        {consultation.diagnoses.map((d) => (
          <div key={d.id} className="rounded-md border border-border p-2 text-sm">
            <b>{d.label}</b> ({d.type}) {d.code ? `· ${d.code}` : ""}
          </div>
        ))}
        {!isLocked && <DiagnosisForm consultationId={consultation.id} patientId={consultation.patientId} />}
      </CardContent>
    </Card>
  );

  // -------- Receta --------
  const recetaTab = (
    <Card>
      <CardContent className="space-y-3 pt-6">
        {/* La receta se imprime con el diagnóstico de la consulta. Si no hay
            ninguno REGISTRADO, se avisa aquí: es el error más fácil de cometer
            (escribirlo en la pestaña de Diagnósticos sin darle Agregar). */}
        {consultation.diagnoses.length === 0 ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <b>Esta consulta no tiene diagnóstico registrado.</b> La receta saldrá sin él. Ve a la pestaña
            <b> Diagnósticos</b>, captúralo y presiona <b>Agregar diagnóstico</b> — no basta con escribirlo.
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-muted/50 px-4 py-2.5 text-sm">
            <span className="text-muted-foreground">Diagnóstico de la receta: </span>
            {consultation.diagnoses.map((d) => d.label).join(" · ")}
          </div>
        )}

        {consultation.prescriptions.map((rx) => (
          <div key={rx.id} className="flex items-center justify-between text-sm">
            <span>Folio {rx.folio} · {rx.status} · {rx.items.length} medicamento(s)</span>
            <Link href={`/prescriptions/${rx.id}`} className="text-primary hover:underline">Ver / Imprimir</Link>
          </div>
        ))}
        {!isLocked && (
          <PrescriptionForm patientId={consultation.patientId} consultationId={consultation.id} />
        )}
      </CardContent>
    </Card>
  );

  // -------- Orden médica --------
  const ordenTab = (
    <Card>
      <CardContent className="pt-6">
        {consultation.medicalOrders.map((o) => (
          <p key={o.id} className="mb-2 text-sm">Folio {o.folio} · {o.type} · {o.status}</p>
        ))}
        {!isLocked && (
          <form action={issueMedicalOrderAction} className="space-y-3">
            <input type="hidden" name="patientId" value={consultation.patientId} />
            <input type="hidden" name="consultationId" value={consultation.id} />
            <Select name="type" defaultValue="">
              <option value="">N/A — No aplica</option>
              <option value="LAB">Laboratorio</option>
              <option value="IMAGING">Imagenología</option>
              <option value="CLINICAL_STUDY">Estudio clínico</option>
              <option value="THERAPY">Terapia</option>
              <option value="PROCEDURE">Procedimiento</option>
              <option value="OTHER">Otro</option>
            </Select>
            {[0, 1, 2].map((i) => (
              <div key={i} className="grid grid-cols-2 gap-2">
                <Input name={`item_${i}_studyName`} placeholder="Estudio solicitado" />
                <Input name={`item_${i}_notes`} placeholder="Notas" />
              </div>
            ))}
            <Textarea name="reason" placeholder="Motivo" />
            <Textarea name="instructions" placeholder="Indicaciones" />
            <Select name="priority" defaultValue="ROUTINE">
              <option value="ROUTINE">Rutina</option>
              <option value="URGENT">Urgente</option>
              <option value="STAT">Inmediata</option>
            </Select>
            <Button type="submit" size="sm">Emitir orden</Button>
          </form>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">
            Consulta — {consultation.patient.firstName} {consultation.patient.lastLastName}
          </h1>
          <p className="text-sm text-muted-foreground">
            Exp. {patient?.recordNumber ?? "—"} · {calculateAge(consultation.patient.birthDate)} años · Dr(a). {consultation.doctor.fullName} ·{" "}
            {new Date(consultation.date).toLocaleDateString("es-MX")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={isLocked ? "success" : "info"}>{consultation.status}</Badge>
          {!isLocked && canEditClinical && (
            <form action={finalizeConsultationAction.bind(null, consultation.id)}>
              <Button type="submit" variant="destructive" size="sm">Finalizar consulta</Button>
            </form>
          )}
        </div>
      </div>

      {isLocked && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="pt-6 text-sm text-amber-800">
            Esta consulta está finalizada y no puede editarse. Cualquier corrección debe agregarse como nota adicional.
          </CardContent>
        </Card>
      )}

      {/*
        Si el paciente tiene historial, esa pestaña va PRIMERO y por lo tanto
        es la que abre por defecto: al entrar a la consulta, lo primero que ve
        el médico es qué pasó antes. Si es paciente de primera vez no hay nada
        que mostrar, así que la pestaña ni siquiera aparece.
      */}
      <SettingsTabs
        tabs={[
          ...(history.length > 0
            ? [
                {
                  id: "historial",
                  label: `Historial (${history.length})`,
                  content: <HistoryTab history={history} />,
                },
              ]
            : []),
          { id: "datos", label: "Datos generales", content: datosTab },
          { id: "signos", label: "Signos vitales", content: signosTab },
          { id: "nota", label: "Nota clínica", content: notaTab },
          { id: "dx", label: "Diagnósticos", content: dxTab },
          { id: "receta", label: "Emitir receta", content: recetaTab },
          { id: "orden", label: "Orden médica", content: ordenTab },
          // El odontograma va AL FINAL de la lista pero es lo primero que abre
          // un dentista, así que se le da su pestaña aquí y no solo en el
          // expediente: el paciente está en el sillón, no en la sala.
          ...(odontogramaTab ? [{ id: "odontograma", label: "Odontograma", content: odontogramaTab }] : []),
        ]}
      />
    </div>
  );
}
