import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/dental/action-button";
import { setTreatmentStatusAction, completeTreatmentAction } from "@/lib/actions/dental";
import { TREATMENT_STATUS_LABEL, surfaceLabel } from "@/lib/constants/odontograma";
import { formatMoney } from "@/lib/utils/money";
import { itemTotal } from "@/lib/services/treatment-plan";
import type { ToothSurface, TreatmentStatus } from "@prisma/client";

type Fila = {
  id: string;
  toothCode: string | null;
  surfaces: ToothSurface[];
  diagnosis: string | null;
  itemName: string;
  listPrice: number | null;
  unitPrice: number;
  quantity: number;
  discount: number;
  status: TreatmentStatus;
  quoteItems: { quote: { id: string; folio: string; status: string } }[];
};

const TONO: Record<TreatmentStatus, "default" | "success" | "warning" | "danger" | "info" | "soft"> = {
  PENDING: "warning",
  ACCEPTED: "info",
  IN_PROGRESS: "soft",
  COMPLETED: "success",
  CANCELLED: "default",
};

/**
 * EL PLAN DE TRATAMIENTO.
 *
 * Cada renglón tiene dos estados que la gente confunde y aquí no se mezclan:
 * el COMERCIAL (pendiente → aceptado) y el CLÍNICO (realizado). "Aceptar" lo
 * puede hacer quien lleva la parte administrativa; "Marcar realizado" solo
 * quien tiene permiso clínico, y ese botón sí escribe en el odontograma.
 */
export function PlanTable({
  patientId,
  items,
  canManage,
  canComplete,
}: {
  patientId: string;
  items: Fila[];
  canManage: boolean;
  canComplete: boolean;
}) {
  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        El plan está vacío. Elige una pieza en el odontograma y agrega el tratamiento que propones.
      </p>
    );
  }

  const vivos = items.filter((i) => i.status !== "CANCELLED");
  const total = vivos.reduce((s, i) => s + itemTotal(i), 0);
  const pendiente = vivos
    .filter((i) => i.status !== "COMPLETED")
    .reduce((s, i) => s + itemTotal(i), 0);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-2 py-2">Pieza</th>
              <th className="px-2 py-2">Diagnóstico</th>
              <th className="px-2 py-2">Tratamiento / producto</th>
              <th className="px-2 py-2 text-right">Cant.</th>
              <th className="px-2 py-2 text-right">Precio</th>
              <th className="px-2 py-2 text-right">Desc.</th>
              <th className="px-2 py-2 text-right">Importe</th>
              <th className="px-2 py-2">Estado</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const cancelado = i.status === "CANCELLED";
              const cotizacion = i.quoteItems[0]?.quote;
              return (
                <tr
                  key={i.id}
                  className={`border-b border-border last:border-0 ${cancelado ? "opacity-55" : ""}`}
                >
                  <td className="px-2 py-2.5 font-medium">
                    {i.toothCode ?? "—"}
                    {i.surfaces.length > 0 && !i.surfaces.includes("WHOLE") && i.toothCode && (
                      <span className="block text-[11px] font-normal text-muted-foreground">
                        {i.surfaces.map((s) => surfaceLabel(s, i.toothCode!)).join(", ")}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-muted-foreground">{i.diagnosis ?? "—"}</td>
                  <td className="px-2 py-2.5">
                    {i.itemName}
                    {cotizacion && (
                      <Link
                        href={`/quotes/${cotizacion.id}`}
                        className="block text-[11px] text-primary hover:underline"
                      >
                        {cotizacion.folio}
                      </Link>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{i.quantity}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">
                    {formatMoney(i.unitPrice)}
                    {/* Si se cobró distinto al catálogo, se ve: son dos números
                        distintos y confundirlos esconde un descuento. */}
                    {i.listPrice !== null && i.listPrice !== i.unitPrice && (
                      <span className="block text-[11px] text-muted-foreground line-through">
                        {formatMoney(i.listPrice)}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">
                    {i.discount > 0 ? formatMoney(i.discount) : "—"}
                  </td>
                  <td className="px-2 py-2.5 text-right font-medium tabular-nums">
                    {formatMoney(itemTotal(i))}
                  </td>
                  <td className="px-2 py-2.5">
                    <Badge tone={TONO[i.status]}>{TREATMENT_STATUS_LABEL[i.status]}</Badge>
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {canComplete && i.status !== "COMPLETED" && i.status !== "CANCELLED" && (
                        <ActionButton
                          action={completeTreatmentAction}
                          fields={{ id: i.id, patientId }}
                          label="Realizado"
                          variant="success"
                          confirmar={`¿Registrar "${i.itemName}"${
                            i.toothCode ? ` en la pieza ${i.toothCode}` : ""
                          } como realizado? Queda escrito en el expediente clínico.`}
                        />
                      )}
                      {canManage && i.status === "PENDING" && (
                        <ActionButton
                          action={setTreatmentStatusAction}
                          fields={{ id: i.id, patientId, status: "ACCEPTED" }}
                          label="Aceptado"
                        />
                      )}
                      {canManage && i.status !== "COMPLETED" && i.status !== "CANCELLED" && (
                        <ActionButton
                          action={setTreatmentStatusAction}
                          fields={{ id: i.id, patientId, status: "CANCELLED" }}
                          label="Cancelar"
                          variant="ghost"
                          confirmar="¿Cancelar este tratamiento del plan?"
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-6 border-t border-border pt-3 text-sm">
        <span className="text-muted-foreground">
          Por hacer: <strong className="tabular-nums text-foreground">{formatMoney(pendiente)}</strong>
        </span>
        <span>
          Total estimado del plan: <strong className="tabular-nums">{formatMoney(total)}</strong>
        </span>
      </div>
    </div>
  );
}
