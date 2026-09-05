import {
  DocumentPaper,
  DocumentHeader,
  PatientBar,
  DocumentFooter,
  type Letterhead,
} from "@/components/documents/letterhead";
import { formatMoney } from "@/lib/utils/money";

export type QuoteDocProps = {
  lh: Letterhead;
  folio: string;
  dateStr: string;
  validStr: string | null;
  patientName: string;
  recordNumber: string;
  estado: string;
  anulada: boolean;
  currency: string;
  items: {
    id: string;
    name: string;
    description: string | null;
    toothCode: string | null;
    quantity: number;
    unitPrice: number;
    discount: number;
    total: number;
  }[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  notes: string | null;
  terms: string | null;
};

/**
 * LA HOJA DE LA COTIZACIÓN.
 *
 * Reutiliza el membrete del consultorio —el mismo de la receta, la orden médica
 * y la referencia—, así que lo que se configure en Configuración → Receta
 * aplica también aquí. No hay un segundo generador de documentos ni una
 * segunda plantilla que mantener.
 *
 * El PDF sale por la impresión del navegador, igual que la receta: "Imprimir /
 * Guardar PDF". No se agregó ninguna librería.
 */
export function QuoteDocument(p: QuoteDocProps) {
  const densidad = p.items.length > 12 ? "dense" : p.items.length > 7 ? "compact" : "normal";

  return (
    <DocumentPaper paperSize="full" density={densidad}>
      <DocumentHeader lh={p.lh} />

      <div className="mt-4 flex items-center justify-between border-b border-slate-200 pb-2">
        <h1 className="text-base font-bold uppercase tracking-wide text-slate-700">
          Presupuesto de tratamiento
        </h1>
        <div className="text-right">
          <div className="font-semibold text-slate-800">{p.folio}</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">{p.estado}</div>
        </div>
      </div>

      {/* Una cotización cancelada o rechazada tiene que verse cancelada en el
          papel: alguien la va a imprimir y a guardar. */}
      {p.anulada && (
        <div className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-red-700">
          {p.estado} — sin validez
        </div>
      )}

      <PatientBar patientName={p.patientName} dateStr={p.dateStr} />

      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        <span>Expediente {p.recordNumber}</span>
        {p.validStr && <span>Vigencia: {p.validStr}</span>}
      </div>

      <table className="mt-5 w-full">
        <thead>
          <tr className="border-b border-slate-300 text-left text-[10px] uppercase tracking-wide text-slate-500">
            <th className="py-1.5">Concepto</th>
            <th className="py-1.5 w-14 text-center">Pieza</th>
            <th className="py-1.5 w-12 text-right">Cant.</th>
            <th className="py-1.5 w-24 text-right">Precio</th>
            <th className="py-1.5 w-20 text-right">Desc.</th>
            <th className="py-1.5 w-24 text-right">Importe</th>
          </tr>
        </thead>
        <tbody>
          {p.items.map((i) => (
            <tr key={i.id} className="border-b border-slate-100 align-top">
              <td className="py-1.5">
                <div className="font-medium text-slate-800">{i.name}</div>
                {i.description && <div className="text-[10px] text-slate-500">{i.description}</div>}
              </td>
              <td className="py-1.5 text-center">{i.toothCode ?? "—"}</td>
              <td className="py-1.5 text-right tabular-nums">{i.quantity}</td>
              <td className="py-1.5 text-right tabular-nums">{formatMoney(i.unitPrice, p.currency)}</td>
              <td className="py-1.5 text-right tabular-nums">
                {i.discount > 0 ? formatMoney(i.discount, p.currency) : "—"}
              </td>
              <td className="py-1.5 text-right font-medium tabular-nums">
                {formatMoney(i.total, p.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <div className="w-56 space-y-1 text-sm">
          <Renglon label="Subtotal" valor={formatMoney(p.subtotal, p.currency)} />
          {p.discount > 0 && <Renglon label="Descuento" valor={`− ${formatMoney(p.discount, p.currency)}`} />}
          {p.tax > 0 && <Renglon label="Impuestos" valor={formatMoney(p.tax, p.currency)} />}
          <div className="flex items-center justify-between border-t border-slate-300 pt-1.5 text-base font-bold text-slate-900">
            <span>Total</span>
            <span className="tabular-nums">{formatMoney(p.total, p.currency)}</span>
          </div>
        </div>
      </div>

      {p.notes && (
        <div className="mt-5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Observaciones</div>
          <p className="whitespace-pre-wrap text-slate-700">{p.notes}</p>
        </div>
      )}

      <div className="mt-4 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] leading-snug text-slate-600">
        {p.terms && <p className="whitespace-pre-wrap">{p.terms}</p>}
        <p className="mt-1">
          Este documento es un presupuesto informativo. No es un comprobante fiscal ni acredita ningún
          pago, y no obliga a realizar los tratamientos listados.
        </p>
      </div>

      <div className="mt-8 flex justify-end">
        <div className="w-64 border-t border-slate-400 pt-1 text-center text-[10px] text-slate-500">
          Enterado — firma del paciente o responsable
        </div>
      </div>

      <DocumentFooter lh={p.lh} />
    </DocumentPaper>
  );
}

function Renglon({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-center justify-between text-slate-600">
      <span>{label}</span>
      <span className="tabular-nums">{valor}</span>
    </div>
  );
}
