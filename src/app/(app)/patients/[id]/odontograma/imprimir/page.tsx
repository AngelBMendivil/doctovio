import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/rbac";
import { isDentalClinic } from "@/lib/services/clinic-features";
import { getPatientById } from "@/lib/services/patients";
import { getOdontogram } from "@/lib/services/odontogram";
import { listTreatmentPlan } from "@/lib/services/treatment-plan";
import { getLetterhead } from "@/lib/services/letterhead";
import { db } from "@/lib/db";
import { calculateAge } from "@/lib/utils/age";
import { formatMoney } from "@/lib/utils/money";
import {
  allTeeth,
  codeLabel,
  surfaceLabel,
  toothName,
  LAYERS,
  TREATMENT_STATUS_LABEL,
  type Dentition,
} from "@/lib/constants/odontograma";
import {
  DocumentPaper,
  DocumentHeader,
  DocumentFooter,
} from "@/components/documents/letterhead";
import { ToothChart, type ChartTooth } from "@/components/dental/tooth-chart";
import { PrintButton } from "@/app/(app)/prescriptions/[id]/print-button";
import { PrintStamp } from "./print-stamp";
import type { ToothSurface } from "@prisma/client";

/**
 * EL ODONTOGRAMA EN PAPEL.
 *
 * Reutiliza el membrete del consultorio —el mismo de la receta, la orden y la
 * referencia— y el MISMO diagrama de la pantalla, en modo de solo lectura. No
 * hay un segundo dibujo del odontograma: si hubiera dos, tarde o temprano
 * pintarían cosas distintas y la hoja impresa diría algo que el sistema no
 * dice.
 *
 * El PDF sale por la impresión del navegador, igual que la receta. Sin
 * librerías nuevas.
 *
 * DOS FECHAS, Y NO SON LO MISMO: la de la consulta (cuándo se atendió al
 * paciente) y la de impresión (cuándo se sacó este papel). Confundirlas en un
 * expediente es confundir el acto clínico con su copia.
 */
export default async function OdontogramaImprimirPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { denticion?: string; consulta?: string };
}) {
  const session = await getSession();
  if (!session) return null;

  if (!(await isDentalClinic(session.organizationId))) redirect(`/patients/${params.id}`);
  if (!hasPermission(session.role, "VIEW_DENTAL_CHART")) redirect(`/patients/${params.id}`);

  const patient = await getPatientById(session.organizationId, params.id);
  if (!patient) notFound();

  const [vista, plan, lh] = await Promise.all([
    getOdontogram(session.organizationId, patient.id),
    listTreatmentPlan(session.organizationId, patient.id),
    getLetterhead(session.organizationId, session.userId),
  ]);

  // La consulta de la que salió la hoja, si viene de una. Se filtra por
  // consultorio Y por paciente: el id llega en la URL.
  const consulta = searchParams.consulta
    ? await db.consultation.findFirst({
        where: { id: searchParams.consulta, organizationId: session.organizationId, patientId: patient.id },
        select: { date: true, doctor: { select: { fullName: true } } },
      })
    : null;

  // Si no viene de una consulta, se muestra la última que tuvo: es la fecha
  // clínica que le da contexto a este odontograma.
  const ultima = consulta
    ? null
    : await db.consultation.findFirst({
        where: { organizationId: session.organizationId, patientId: patient.id },
        orderBy: { date: "desc" },
        select: { date: true, doctor: { select: { fullName: true } } },
      });

  const referencia = consulta ?? ultima;

  const estadosDe = (d: Dentition): Record<string, ChartTooth> => {
    const out: Record<string, ChartTooth> = {};
    for (const code of allTeeth(d)) {
      const e = vista.estados.get(code);
      if (e) {
        out[code] = {
          surfaces: e.surfaces,
          whole: e.whole,
          missing: e.missing,
          total: e.total,
          pendientes: e.pendientes,
        };
      }
    }
    return out;
  };

  const permanente = estadosDe("PERMANENT");
  const temporal = estadosDe("DECIDUOUS");

  // La dentición temporal solo se imprime si tiene algo: en un adulto, media
  // hoja de dientes de leche vacíos no le sirve a nadie.
  const pedida = searchParams.denticion === "DECIDUOUS" ? "DECIDUOUS" : "PERMANENT";
  const hayTemporal = Object.keys(temporal).length > 0;
  const imprimir: Dentition[] =
    pedida === "DECIDUOUS" ? ["DECIDUOUS"] : hayTemporal ? ["PERMANENT", "DECIDUOUS"] : ["PERMANENT"];

  // Detalle por pieza, en texto. El diagrama se lee de un vistazo; esto es lo
  // que se puede leer sin distinguir los colores, y lo que queda por escrito.
  const piezas = [...vista.estados.entries()]
    .filter(([, e]) => e.total > 0 || e.pendientes > 0)
    .sort(([a], [b]) => a.localeCompare(b));

  const nombre = `${patient.firstName} ${patient.lastLastName} ${patient.secondLastName ?? ""}`.trim();
  const planVivo = plan.filter((p) => p.status !== "CANCELLED" && p.status !== "COMPLETED");

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/patients/${patient.id}/odontograma`} className="text-sm text-primary hover:underline">
          ← Volver al odontograma
        </Link>
        <PrintButton />
      </div>

      <style dangerouslySetInnerHTML={{ __html: "@page{size:letter;margin:12mm}" }} />

      <DocumentPaper paperSize="full" density={piezas.length > 10 ? "compact" : "normal"}>
        <DocumentHeader lh={lh} />

        <div className="mt-4 flex items-end justify-between border-b border-slate-200 pb-2">
          <h1 className="text-base font-bold uppercase tracking-wide text-slate-700">Odontograma</h1>
          <div className="text-right text-[10px] text-slate-500">
            <div>
              Expediente <span className="font-medium text-slate-700">{patient.recordNumber}</span>
            </div>
          </div>
        </div>

        {/* Paciente. El nombre y la edad van juntos porque la edad cambia cómo
            se lee un odontograma: a los 8 años faltan piezas por erupcionar. */}
        <div className="mt-4 rounded bg-[#e8f1f4] px-4 py-2.5">
          <div className="text-base font-semibold text-slate-900">{nombre}</div>
          <div className="mt-0.5 text-[11px] text-slate-600">
            {calculateAge(patient.birthDate)} años · Nacimiento{" "}
            {new Date(patient.birthDate).toLocaleDateString("es-MX")}
            {patient.sex === "FEMALE" ? " · Femenino" : patient.sex === "MALE" ? " · Masculino" : ""}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap justify-between gap-2 text-[11px] text-slate-600">
          <span>
            {referencia ? (
              <>
                {consulta ? "Consulta del" : "Última consulta:"}{" "}
                <span className="font-medium text-slate-800">
                  {new Date(referencia.date).toLocaleDateString("es-MX", { dateStyle: "long" })}
                </span>
                {referencia.doctor?.fullName ? ` · Dr(a). ${referencia.doctor.fullName}` : ""}
              </>
            ) : (
              "Sin consultas registradas"
            )}
          </span>
          <span>
            Impreso el <PrintStamp />
          </span>
        </div>

        {/* Diagrama: el mismo de la pantalla, sin poder tocarse. */}
        {imprimir.map((d) => (
          <div key={d} className="mt-5" style={{ breakInside: "avoid" }}>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Dentición {d === "PERMANENT" ? "permanente" : "temporal"}
            </div>
            <ToothChart
              dentition={d}
              estados={d === "PERMANENT" ? permanente : temporal}
              seleccionado={null}
              soloLectura
            />
          </div>
        ))}

        {/* Detalle por pieza */}
        <div className="mt-6" style={{ breakInside: "avoid" }}>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Detalle por pieza
          </div>
          {piezas.length === 0 ? (
            <p className="text-slate-500">Sin registros en el odontograma.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-300 text-left text-[10px] uppercase tracking-wide text-slate-500">
                  <th className="w-16 py-1.5">Pieza</th>
                  <th className="py-1.5">Nombre</th>
                  <th className="py-1.5">Estado registrado</th>
                </tr>
              </thead>
              <tbody>
                {piezas.map(([code, e]) => {
                  const marcas = [
                    ...Object.entries(e.surfaces).map(
                      ([s, m]) =>
                        `${m.label} (${surfaceLabel(s as ToothSurface, code)}) — ${LAYERS[m.layer].label}`
                    ),
                    ...e.whole.map((m) => `${m.label} — ${LAYERS[m.layer].label}`),
                  ];
                  return (
                    <tr key={code} className="border-b border-slate-100 align-top">
                      <td className="py-1.5 font-semibold text-slate-800">{code}</td>
                      <td className="py-1.5 text-slate-600">{toothName(code)}</td>
                      <td className="py-1.5 text-slate-700">
                        {e.missing && <span className="font-medium">Ausente. </span>}
                        {marcas.join(" · ") || "Sin marcas"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Lo que falta por hacer. En papel es lo que el paciente se lleva. */}
        {planVivo.length > 0 && (
          <div className="mt-6" style={{ breakInside: "avoid" }}>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Tratamientos por realizar
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-300 text-left text-[10px] uppercase tracking-wide text-slate-500">
                  <th className="w-16 py-1.5">Pieza</th>
                  <th className="py-1.5">Tratamiento</th>
                  <th className="py-1.5">Estado</th>
                  <th className="w-28 py-1.5 text-right">Importe</th>
                </tr>
              </thead>
              <tbody>
                {planVivo.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100">
                    <td className="py-1.5 font-semibold text-slate-800">{p.toothCode ?? "—"}</td>
                    <td className="py-1.5 text-slate-700">
                      {p.itemName}
                      {p.diagnosis ? <span className="text-slate-500"> · {p.diagnosis}</span> : null}
                    </td>
                    <td className="py-1.5 text-slate-600">{TREATMENT_STATUS_LABEL[p.status]}</td>
                    <td className="py-1.5 text-right tabular-nums text-slate-700">
                      {formatMoney(p.unitPrice * p.quantity - p.discount, p.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-[10px] text-slate-500">
              Importes informativos. Este documento no es una cotización ni un comprobante de pago.
            </p>
          </div>
        )}

        {/* Leyenda: el color nunca va solo. */}
        <div className="mt-5 flex flex-wrap gap-4 border-t border-slate-200 pt-2 text-[10px] text-slate-600">
          {Object.values(LAYERS).map((l) => (
            <span key={l.label} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm border border-slate-300"
                style={{ backgroundColor: l.color }}
              />
              <span className="font-bold">{l.letra}</span>
              {l.label}
            </span>
          ))}
          <span className="text-slate-500">Derecha e izquierda son las del paciente.</span>
        </div>

        <DocumentFooter lh={lh} />
      </DocumentPaper>
    </div>
  );
}
