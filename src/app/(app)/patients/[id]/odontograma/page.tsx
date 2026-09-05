import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/rbac";
import { isDentalClinic } from "@/lib/services/clinic-features";
import { getPatientById } from "@/lib/services/patients";
import { getOdontogram, getOdontogramSummary } from "@/lib/services/odontogram";
import { listTreatmentPlan, listQuotablePlanItems, itemTotal } from "@/lib/services/treatment-plan";
import { listPatientQuotes, quoteStateLabel } from "@/lib/services/quotes";
import { listActiveCatalogItems } from "@/lib/services/catalog";
import { getClinicCurrency } from "@/lib/services/organizations";
import { createQuoteAction } from "@/lib/actions/dental";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SettingsTabs } from "@/app/(app)/settings/settings-tabs";
import { SettingsForm } from "@/app/(app)/settings/settings-form";
import { ToothChart, type ChartTooth } from "@/components/dental/tooth-chart";
import { ToothPanel, ToothPanelEmpty } from "@/components/dental/tooth-panel";
import { PlanTable } from "@/components/dental/plan-table";
import { QuoteFields } from "@/components/dental/quote-fields";
import { allTeeth, codeLabel, type Dentition } from "@/lib/constants/odontograma";
import { calculateAge } from "@/lib/utils/age";
import { formatMoney } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";

/**
 * ODONTOGRAMA DEL PACIENTE.
 *
 * Es una ruta NUEVA colgada del expediente que ya existe: el paciente, sus
 * datos, sus documentos y su historia son los de siempre. No hay una segunda
 * ficha dental, y la pantalla del paciente de un consultorio médico no cambia
 * en nada.
 *
 * Todo lo que se elige —dentición, pieza, fecha, pestaña— vive en la URL. Al
 * guardar algo, la acción revalida y el árbol se vuelve a renderizar: con
 * estado local, el dentista perdería la pieza abierta justo después de anotar
 * en ella.
 */
export default async function OdontogramaPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string; diente?: string; denticion?: string; ver?: string };
}) {
  const session = await getSession();
  if (!session) return null;

  // El módulo dental no existe para un consultorio médico. Se comprueba aquí y
  // otra vez en cada acción: ocultar el enlace no protege una ruta.
  if (!(await isDentalClinic(session.organizationId))) redirect(`/patients/${params.id}`);
  if (!hasPermission(session.role, "VIEW_DENTAL_CHART")) redirect(`/patients/${params.id}`);

  const patient = await getPatientById(session.organizationId, params.id);
  if (!patient) notFound();

  const dentition: Dentition = searchParams.denticion === "DECIDUOUS" ? "DECIDUOUS" : "PERMANENT";
  const verInicial = searchParams.ver === "inicial";

  // El odontograma INICIAL no se guarda aparte: se reconstruye pidiendo el
  // estado al día de la primera anotación. Es lo que compra llevar bitácora.
  const base = await getOdontogram(session.organizationId, patient.id);
  const asOf = verInicial && base.primeraFecha ? finDelDia(base.primeraFecha) : undefined;
  const vista = asOf ? await getOdontogram(session.organizationId, patient.id, { asOf }) : base;

  const [resumen, plan, cotizables, quotes, catalogo, moneda] = await Promise.all([
    getOdontogramSummary(session.organizationId, patient.id),
    listTreatmentPlan(session.organizationId, patient.id),
    listQuotablePlanItems(session.organizationId, patient.id),
    listPatientQuotes(session.organizationId, patient.id),
    listActiveCatalogItems(session.organizationId),
    getClinicCurrency(session.organizationId),
  ]);

  const canEdit = hasPermission(session.role, "EDIT_DENTAL_CHART");
  const canComplete = hasPermission(session.role, "MANAGE_DENTAL_TREATMENT");
  const canManage = hasPermission(session.role, "MANAGE_QUOTES");
  const canQuote = hasPermission(session.role, "CREATE_QUOTES");

  // El Map no cruza al navegador: se manda como objeto plano.
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

  const dienteElegido =
    searchParams.diente && allTeeth(dentition).includes(searchParams.diente)
      ? searchParams.diente
      : null;

  const opcionesCatalogo = catalogo.map((c) => ({
    id: c.id,
    name: c.name,
    price: c.price,
    currency: c.currency,
    categoryName: c.category?.name ?? null,
  }));

  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const actual = {
      tab: searchParams.tab,
      diente: searchParams.diente,
      denticion: searchParams.denticion,
      ver: searchParams.ver,
      ...extra,
    };
    for (const [k, v] of Object.entries(actual)) if (v) p.set(k, v);
    const s = p.toString();
    return `/patients/${patient.id}/odontograma${s ? `?${s}` : ""}`;
  };

  // ---------------------------------------------------------------- pestañas

  const odontogramaTab = (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Odontograma {verInicial ? "inicial" : "actual"}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {verInicial
                ? `Cómo estaba la boca el ${base.primeraFecha ? fechaCorta(base.primeraFecha) : "primer día"}.`
                : `${resumen.piezasAnotadas} pieza(s) con registro · ${resumen.pendientes} tratamiento(s) por hacer`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Selector
              opciones={[
                { href: qs({ denticion: undefined }), label: "Permanente", activo: dentition === "PERMANENT" },
                { href: qs({ denticion: "DECIDUOUS" }), label: "Temporal", activo: dentition === "DECIDUOUS" },
              ]}
            />
            <Selector
              opciones={[
                { href: qs({ ver: undefined }), label: "Actual", activo: !verInicial },
                { href: qs({ ver: "inicial" }), label: "Inicial", activo: verInicial },
              ]}
            />
          </div>
        </CardHeader>
        <CardContent>
          {verInicial && (
            <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Estás viendo el estado inicial, solo de lectura. El registro se hace sobre el actual.
            </p>
          )}
          <ToothChart dentition={dentition} estados={estados} seleccionado={dienteElegido} />
        </CardContent>
      </Card>

      {dienteElegido && !verInicial ? (
        <ToothPanel
          organizationId={session.organizationId}
          patientId={patient.id}
          toothCode={dienteElegido}
          catalogo={opcionesCatalogo}
          canEdit={canEdit}
          canComplete={canComplete}
          canOverridePrice={hasPermission(session.role, "OVERRIDE_PRICE")}
          monedaPorOmision={moneda}
        />
      ) : (
        <ToothPanelEmpty />
      )}
    </div>
  );

  const planTab = (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Plan de tratamiento</CardTitle>
          <p className="text-sm text-muted-foreground">
            Lo que se le propone al paciente. Aceptar un tratamiento no significa que ya se hizo.
          </p>
        </CardHeader>
        <CardContent>
          <PlanTable
            patientId={patient.id}
            items={plan}
            canManage={canManage}
            canComplete={canComplete}
          />
        </CardContent>
      </Card>

      {canQuote && cotizables.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Generar cotización</CardTitle>
          </CardHeader>
          <CardContent>
            <SettingsForm
              action={createQuoteAction}
              submitLabel="Generar cotización"
              className="grid grid-cols-1 gap-4 md:grid-cols-2"
            >
              <QuoteFields
                patientId={patient.id}
                items={cotizables.map((i) => ({
                  id: i.id,
                  nombre: i.itemName,
                  currency: i.currency,
                  toothCode: i.toothCode,
                  diagnosis: i.diagnosis,
                  cantidad: i.quantity,
                  precio: i.unitPrice,
                  total: itemTotal(i),
                  estado: i.status,
                }))}
              />
            </SettingsForm>
          </CardContent>
        </Card>
      )}
    </div>
  );

  const historialTab = (
    <Card>
      <CardHeader>
        <CardTitle>Historial odontológico ({base.entries.length})</CardTitle>
        <p className="text-sm text-muted-foreground">
          Todo lo registrado, de lo más nuevo a lo más viejo. Nada se borra.
        </p>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {base.entries.length === 0 && (
          <p className="text-muted-foreground">Sin registros en el odontograma.</p>
        )}
        {[...base.entries].reverse().map((e) => (
          <div
            key={e.id}
            className="flex flex-wrap items-start justify-between gap-2 border-b border-border pb-2 last:border-0"
          >
            <div className={e.status === "CANCELLED" ? "opacity-60" : undefined}>
              <p className={e.status === "CANCELLED" ? "line-through" : "font-medium"}>
                Pieza {e.toothCode} · {codeLabel(e.code)}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(e.recordedAt).toLocaleString("es-MX", { dateStyle: "medium" })} ·{" "}
                {e.doctor.fullName}
              </p>
              {e.notes && <p className="mt-0.5 text-xs text-muted-foreground">{e.notes}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Link href={qs({ tab: "chart", diente: e.toothCode, ver: undefined })} className="text-xs text-primary hover:underline">
                Ver pieza
              </Link>
              <Badge tone={e.kind === "FINDING" ? "danger" : "success"}>
                {e.kind === "FINDING" ? "Hallazgo" : "Tratamiento"}
              </Badge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );

  const cotizacionesTab = (
    <Card>
      <CardHeader>
        <CardTitle>Cotizaciones ({quotes.length})</CardTitle>
        <p className="text-sm text-muted-foreground">
          Documentos comerciales del paciente. Ninguno registra un pago.
        </p>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {quotes.length === 0 && <p className="text-muted-foreground">Todavía no hay cotizaciones.</p>}
        {quotes.map((q) => (
          <div
            key={q.id}
            className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0"
          >
            <div>
              <p className="font-medium">{q.folio}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(q.issuedAt).toLocaleDateString("es-MX")} · {q._count.items} concepto(s) ·{" "}
                {q.createdBy.fullName}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="tabular-nums">{formatMoney(q.total, q.currency)}</span>
              <Badge tone={badgeDeCotizacion(q.status)}>{quoteStateLabel(q)}</Badge>
              <Link href={`/quotes/${q.id}`} className="text-xs text-primary hover:underline">
                Ver / Imprimir
              </Link>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/patients/${patient.id}`} className="text-sm text-primary hover:underline">
            ← Volver al expediente
          </Link>
          <h1 className="mt-1 text-xl font-semibold">
            {patient.firstName} {patient.lastLastName} {patient.secondLastName}
          </h1>
          <p className="text-sm text-muted-foreground">
            Expediente {patient.recordNumber} · {calculateAge(patient.birthDate)} años
          </p>
        </div>
      </div>

      <SettingsTabs
        tabs={[
          { id: "chart", label: "Odontograma", content: odontogramaTab },
          { id: "plan", label: `Plan de tratamiento (${plan.filter((p) => p.status !== "CANCELLED").length})`, content: planTab },
          { id: "historial", label: "Historial", content: historialTab },
          { id: "cotizaciones", label: `Cotizaciones (${quotes.length})`, content: cotizacionesTab },
        ]}
      />
    </div>
  );
}

function Selector({ opciones }: { opciones: { href: string; label: string; activo: boolean }[] }) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-border p-0.5 text-xs">
      {opciones.map((o) => (
        <Link
          key={o.label}
          href={o.href}
          scroll={false}
          className={cn(
            "rounded px-2.5 py-1.5",
            o.activo ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

function badgeDeCotizacion(status: string): "default" | "success" | "warning" | "danger" | "info" {
  if (status === "ACCEPTED") return "success";
  if (status === "REJECTED" || status === "CANCELLED") return "danger";
  if (status === "SENT" || status === "PARTIAL") return "info";
  return "warning";
}

/** Fin del día: para que el "inicial" incluya todo lo anotado esa jornada. */
function finDelDia(d: Date): Date {
  const f = new Date(d);
  f.setHours(23, 59, 59, 999);
  return f;
}

const fechaCorta = (d: Date) => new Date(d).toLocaleDateString("es-MX", { dateStyle: "long" });
