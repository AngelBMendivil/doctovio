import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SettingsForm } from "@/app/(app)/settings/settings-form";
import { EntryFields } from "@/components/dental/entry-fields";
import { TreatmentFields, type CatalogOption } from "@/components/dental/treatment-fields";
import { ActionButton } from "@/components/dental/action-button";
import { addEntryAction, addTreatmentAction, completeTreatmentAction } from "@/lib/actions/dental";
import {
  codeLabel,
  surfaceLabel,
  toothName,
  LAYERS,
  TREATMENT_STATUS_LABEL,
} from "@/lib/constants/odontograma";
import { formatMoney } from "@/lib/utils/money";
import { getToothHistory, getToothPlan, getToothDocuments } from "@/lib/services/odontogram";
import type { ToothSurface } from "@prisma/client";

const GRID = "grid grid-cols-1 gap-4 md:grid-cols-2";

const fecha = (d: Date) => new Date(d).toLocaleDateString("es-MX", { dateStyle: "medium" });

/**
 * LA HISTORIA CLÍNICA DE UNA PIEZA.
 *
 * Todo lo que le ha pasado a ese diente, en orden, con quién lo anotó. Es lo
 * que hace que el odontograma sirva de guía y no solo de dibujo: al abrir el 16
 * se ve que hace dos años se le puso una resina en oclusal, que el año pasado
 * hubo sensibilidad y que ahora hay una endodoncia planeada.
 *
 * Lo cancelado se muestra tachado, no se esconde: es un expediente clínico.
 */
export async function ToothPanel({
  organizationId,
  patientId,
  toothCode,
  catalogo,
  canEdit,
  canComplete,
  canOverridePrice,
}: {
  organizationId: string;
  patientId: string;
  toothCode: string;
  catalogo: CatalogOption[];
  canEdit: boolean;
  canComplete: boolean;
  canOverridePrice: boolean;
}) {
  const [historia, plan, documentos] = await Promise.all([
    getToothHistory(organizationId, patientId, toothCode),
    getToothPlan(organizationId, patientId, toothCode),
    getToothDocuments(organizationId, patientId, toothCode),
  ]);

  const vivos = plan.filter((p) => p.status !== "CANCELLED" && p.status !== "COMPLETED");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>
            Pieza {toothCode} · {toothName(toothCode)}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {historia.length} anotación{historia.length === 1 ? "" : "es"} en el expediente ·{" "}
            {vivos.length} tratamiento{vivos.length === 1 ? "" : "s"} por hacer
          </p>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* --- Historia de la pieza --- */}
          {historia.length === 0 && plan.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Esta pieza no tiene nada registrado todavía.
            </p>
          )}

          {historia.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Historia clínica de la pieza
              </p>
              <div className="space-y-2 text-sm">
                {historia.map((e) => {
                  const cancelada = e.status === "CANCELLED";
                  return (
                    <div
                      key={e.id}
                      className="flex flex-wrap items-start justify-between gap-2 border-b border-border pb-2 last:border-0"
                    >
                      <div className={cancelada ? "opacity-60" : undefined}>
                        <p className={cancelada ? "line-through" : "font-medium"}>
                          {codeLabel(e.code)}
                          {e.surfaces.length > 0 && !e.surfaces.includes("WHOLE") && (
                            <span className="font-normal text-muted-foreground">
                              {" "}
                              · {e.surfaces.map((s: ToothSurface) => surfaceLabel(s, toothCode)).join(", ")}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {fecha(e.recordedAt)} · {e.doctor.fullName}
                          {e.planItemResult && ` · ${formatMoney(e.planItemResult.unitPrice)}`}
                        </p>
                        {e.notes && <p className="mt-0.5 text-xs text-muted-foreground">{e.notes}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={cancelada ? "default" : e.kind === "FINDING" ? "danger" : "success"}>
                          {cancelada ? "Corregido" : e.kind === "FINDING" ? "Hallazgo" : "Realizado"}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* --- Lo planeado para esta pieza --- */}
          {plan.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Plan de tratamiento de la pieza
              </p>
              <div className="space-y-2 text-sm">
                {plan.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0"
                  >
                    <div>
                      <p className="font-medium">
                        {p.itemName}
                        {p.diagnosis && (
                          <span className="font-normal text-muted-foreground"> · {p.diagnosis}</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatMoney(p.unitPrice)} · {fecha(p.createdAt)} · {p.createdBy.fullName}
                        {p.quoteItems[0] && ` · ${p.quoteItems[0].quote.folio}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={p.status === "COMPLETED" ? "success" : p.status === "CANCELLED" ? "default" : "warning"}>
                        {TREATMENT_STATUS_LABEL[p.status]}
                      </Badge>
                      {canComplete && p.status !== "COMPLETED" && p.status !== "CANCELLED" && (
                        <ActionButton
                          action={completeTreatmentAction}
                          fields={{ id: p.id, patientId }}
                          label="Marcar realizado"
                          variant="success"
                          confirmar={`¿Registrar "${p.itemName}" como realizado en la pieza ${toothCode}? Queda escrito en el expediente.`}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {documentos.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Documentos de la pieza
              </p>
              <ul className="space-y-1 text-sm">
                {documentos.map((d) => (
                  <li key={d.id} className="flex items-center justify-between">
                    <span>{d.name}</span>
                    <span className="text-xs text-muted-foreground">{fecha(d.uploadedAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {canEdit && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Registrar en la pieza {toothCode}</CardTitle>
              <p className="text-sm text-muted-foreground">
                Lo que encontraste, o un tratamiento que ya hiciste.
              </p>
            </CardHeader>
            <CardContent>
              <SettingsForm action={addEntryAction} submitLabel="Guardar en el expediente" className={GRID}>
                <EntryFields patientId={patientId} toothCode={toothCode} />
              </SettingsForm>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Planear un tratamiento</CardTitle>
              <p className="text-sm text-muted-foreground">
                Lo que se le propone al paciente, con su precio. No es un cobro.
              </p>
            </CardHeader>
            <CardContent>
              <SettingsForm action={addTreatmentAction} submitLabel="Agregar al plan" className={GRID}>
                <TreatmentFields
                  patientId={patientId}
                  toothCode={toothCode}
                  catalogo={catalogo}
                  canOverridePrice={canOverridePrice}
                />
              </SettingsForm>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

/** Cabecera cuando no hay pieza elegida. */
export function ToothPanelEmpty() {
  return (
    <Card>
      <CardContent className="py-8 text-center text-sm text-muted-foreground">
        Toca una pieza del diagrama para ver su historia y registrar en ella.
        <div className="mt-3 flex flex-wrap justify-center gap-3 text-xs">
          {Object.values(LAYERS).map((l) => (
            <span key={l.label} className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-sm border border-border"
                style={{ backgroundColor: l.color }}
              />
              {l.label}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
