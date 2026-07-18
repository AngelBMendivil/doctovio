import Link from "next/link";
import { Stethoscope, Pill, FlaskConical, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Item = { id: string; medicationName: string; dose: string | null; frequency: string | null };

type Consultation = {
  id: string;
  date: Date;
  status: string;
  assessment: string | null;
  plan: string | null;
  doctor: { fullName: string };
  diagnoses: { id: string; label: string; type: string; code: string | null }[];
  prescriptions: { id: string; folio: string; status: string; items: Item[] }[];
  medicalOrders: { id: string; folio: string; items: { id: string; studyName: string }[] }[];
  vitalSigns: {
    id: string;
    weightKg: number | null;
    temperatureC: number | null;
    systolicPressure: number | null;
    diastolicPressure: number | null;
    heartRate: number | null;
    oxygenSaturation: number | null;
    glucose: number | null;
  }[];
};

const DX_TYPE: Record<string, string> = {
  PRESUMPTIVE: "Presuntivo",
  CONFIRMED: "Confirmado",
  DIFFERENTIAL: "Diferencial",
  CHRONIC: "Crónico",
  RESOLVED: "Resuelto",
};

const fullDate = (d: Date) =>
  new Date(d).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "long", year: "numeric" });

/** Resumen de signos vitales en una línea: solo lo que se capturó. */
function vitalsLine(v: Consultation["vitalSigns"][number]): string {
  const parts: string[] = [];
  if (v.systolicPressure && v.diastolicPressure) parts.push(`TA ${v.systolicPressure}/${v.diastolicPressure}`);
  if (v.heartRate) parts.push(`FC ${v.heartRate}`);
  if (v.temperatureC) parts.push(`T ${v.temperatureC}°C`);
  if (v.oxygenSaturation) parts.push(`SpO2 ${v.oxygenSaturation}%`);
  if (v.weightKg) parts.push(`Peso ${v.weightKg} kg`);
  if (v.glucose) parts.push(`Glucosa ${v.glucose}`);
  return parts.join(" · ");
}

/**
 * Historial del paciente, visible durante la consulta.
 *
 * Cada visita se abre y cierra: la más reciente arriba y desplegada, porque es
 * la que casi siempre importa. El médico no debería salir de la consulta para
 * recordar qué le recetó al paciente el mes pasado.
 */
export function HistoryTab({ history }: { history: Consultation[] }) {
  if (history.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center">
        <Stethoscope className="mx-auto h-8 w-8 text-muted-foreground/40" />
        <p className="mt-2 text-sm text-muted-foreground">
          Primera consulta de este paciente: aún no hay historial que mostrar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {history.length} consulta{history.length === 1 ? "" : "s"} anterior{history.length === 1 ? "" : "es"}. La más
        reciente aparece abierta.
      </p>

      {history.map((c, i) => {
        const v = c.vitalSigns[0];
        const vitals = v ? vitalsLine(v) : "";

        return (
          <details key={c.id} open={i === 0} className="rounded-xl border border-border bg-card">
            <summary className="flex cursor-pointer select-none flex-wrap items-center justify-between gap-2 p-4">
              <span>
                <span className="text-sm font-semibold text-navy">{fullDate(c.date)}</span>
                <span className="block text-xs text-muted-foreground">Dr(a). {c.doctor.fullName}</span>
              </span>
              <span className="flex flex-wrap items-center gap-1.5">
                {c.diagnoses.length > 0 && <Badge tone="info">{c.diagnoses.length} dx</Badge>}
                {c.prescriptions.length > 0 && <Badge tone="success">{c.prescriptions.length} receta</Badge>}
                {c.status !== "COMPLETED" && <Badge tone="warning">Sin finalizar</Badge>}
              </span>
            </summary>

            <div className="space-y-3 border-t border-border p-4 text-sm">
              {vitals && (
                <p className="flex items-start gap-2 text-muted-foreground">
                  <Activity className="mt-0.5 h-4 w-4 shrink-0" />
                  {vitals}
                </p>
              )}

              {c.diagnoses.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Diagnósticos
                  </p>
                  <ul className="space-y-0.5">
                    {c.diagnoses.map((d) => (
                      <li key={d.id}>
                        <span className="font-medium text-navy">{d.label}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          · {DX_TYPE[d.type] ?? d.type}
                          {d.code ? ` · ${d.code}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {c.prescriptions.length > 0 && (
                <div>
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Pill className="h-3.5 w-3.5" /> Recetas
                  </p>
                  {c.prescriptions.map((rx) => (
                    <div key={rx.id} className="mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Folio {rx.folio}</span>
                        {rx.status === "CANCELLED" && <Badge tone="danger">Cancelada</Badge>}
                        <Link href={`/prescriptions/${rx.id}`} className="text-xs text-primary hover:underline">
                          Ver
                        </Link>
                      </div>
                      <ul className="ml-1 mt-0.5 space-y-0.5">
                        {rx.items.map((it) => (
                          <li key={it.id} className="text-muted-foreground">
                            <span className="font-medium text-navy">{it.medicationName}</span>
                            {it.dose ? ` · ${it.dose}` : ""}
                            {it.frequency ? ` · ${it.frequency}` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {c.medicalOrders.length > 0 && (
                <div>
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <FlaskConical className="h-3.5 w-3.5" /> Órdenes médicas
                  </p>
                  {c.medicalOrders.map((o) => (
                    <p key={o.id} className="text-muted-foreground">
                      {o.items.map((it) => it.studyName).join(", ") || `Folio ${o.folio}`}
                    </p>
                  ))}
                </div>
              )}

              {(c.assessment || c.plan) && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Nota clínica
                  </p>
                  {c.assessment && (
                    <p className="text-muted-foreground">
                      <b className="text-navy">Análisis:</b> {c.assessment}
                    </p>
                  )}
                  {c.plan && (
                    <p className="text-muted-foreground">
                      <b className="text-navy">Plan:</b> {c.plan}
                    </p>
                  )}
                </div>
              )}

              <Link href={`/consultations/${c.id}`} className="inline-block text-xs text-primary hover:underline">
                Abrir consulta completa →
              </Link>
            </div>
          </details>
        );
      })}
    </div>
  );
}
