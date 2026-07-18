import {
  DocumentPaper,
  DocumentHeader,
  DocumentFooter,
  PatientBar,
  type Letterhead,
  type Density,
} from "@/components/documents/letterhead";

type Item = {
  id: string;
  medicationName: string;
  activeIngredient: string | null;
  presentation: string | null;
  quantityToDispense: string | null;
  dose: string | null;
  route: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
};

export type PrescriptionDocProps = {
  lh: Letterhead;
  folio: string;
  dateStr: string;
  dob: string;
  statusLabel: string;
  isVoid: boolean;
  replacesFolio?: string;
  replacedByFolio?: string;
  patientName: string;
  age: number;
  sexLabel: string;
  allergies: string;
  /** El paciente declaró no tener alergias. Distinto de no haber contestado. */
  allergiesNegated?: boolean;
  diagnosis: string;
  items: Item[];
  generalInstructions: string;
  recommendations: string;
  paperSize: "full" | "half";
};

/** Arma la indicación en lenguaje natural: "1 cápsula, vía oral, cada 48 h, por 60 días." */
function composeInstruction(it: Item): string {
  const parts: string[] = [];
  if (it.dose) parts.push(it.dose);
  if (it.route) parts.push(`vía ${it.route.toLowerCase()}`);
  if (it.frequency) parts.push(it.frequency);
  if (it.duration) {
    // "por Indefinida" no es español. Un periodo indefinido no lleva "por".
    const d = it.duration.trim();
    parts.push(/^indefinid/i.test(d) ? "por tiempo indefinido" : `por ${d}`);
  }
  let s = parts.join(", ");
  if (it.instructions) s = s ? `${s}. ${it.instructions}` : it.instructions;
  return s;
}

/**
 * Cuántos medicamentos caben cómodos antes de tener que apretar el texto.
 * Media carta tiene menos de la mitad del alto útil de una carta, y el
 * membrete ocupa lo mismo en ambas.
 */
function densityFor(count: number, paperSize: "full" | "half"): Density {
  const comfortable = paperSize === "half" ? 3 : 6;
  if (count <= comfortable) return "normal";
  if (count <= comfortable * 2) return "compact";
  return "dense";
}

/** Espaciado y tamaño del nombre del medicamento, acorde a la densidad. */
const ITEM_STYLES: Record<Density, { gap: string; name: string }> = {
  normal: { gap: "mt-5 space-y-4", name: "text-[13px]" },
  compact: { gap: "mt-4 space-y-2.5", name: "text-[12px]" },
  dense: { gap: "mt-3 space-y-2", name: "text-[11px]" },
};

export function PrescriptionDocument(p: PrescriptionDocProps) {
  const { cfg } = p.lh;
  const density = densityFor(p.items.length, p.paperSize);
  const item = ITEM_STYLES[density];

  return (
    <DocumentPaper paperSize={p.paperSize} density={density}>
      {p.isVoid && (
        <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-1.5 text-center text-sm font-semibold text-red-700">
          Receta {p.statusLabel} — no válida
        </div>
      )}

      <DocumentHeader lh={p.lh} />
      <PatientBar patientName={p.patientName} dateStr={p.dateStr} />

      <div className="mt-3 text-slate-600">
        {p.dob && <div>Fecha de nacimiento: {p.dob}</div>}
        <div>
          Edad: {p.age} años{p.sexLabel ? ` · ${p.sexLabel}` : ""}
        </div>
      </div>
      {/* "Negadas" en gris = el paciente lo declaró. Vacío = nadie preguntó, y
          eso el médico debe notarlo antes de recetar. */}
      {cfg.showAllergies &&
        (p.allergies ? (
          <div className="mt-1 font-medium text-red-700">Alergias: {p.allergies}</div>
        ) : (
          <div className="mt-1 text-slate-600">Alergias: {p.allergiesNegated ? "negadas" : "sin registro"}</div>
        ))}
      {cfg.showDiagnosis && p.diagnosis && (
        <div className="mt-3">
          <b>Diagnóstico:</b> {p.diagnosis}
        </div>
      )}

      {/* Medicamentos. breakInside: avoid impide que un medicamento se parta
          a la mitad si la receta se va a dos páginas. */}
      <div className={item.gap}>
        {p.items.map((it) => (
          <div key={it.id} style={{ breakInside: "avoid" }}>
            <div className={`text-slate-900 ${item.name}`}>
              <span className="font-semibold">{it.medicationName}</span>
              {it.activeIngredient ? <span className="text-slate-600"> ({it.activeIngredient})</span> : null}
              {it.presentation ? ` ${it.presentation}` : ""}
            </div>
            {it.quantityToDispense && <div className="text-slate-700">{it.quantityToDispense}</div>}
            {composeInstruction(it) && <div className="text-slate-700">{composeInstruction(it)}</div>}
          </div>
        ))}
        {p.items.length === 0 && <div className="text-slate-500">Sin medicamentos.</div>}
      </div>

      {p.generalInstructions && (
        <div className="mt-4">
          <b>Indicaciones:</b> {p.generalInstructions}
        </div>
      )}
      {p.recommendations && (
        <div className="mt-1">
          <b>Recomendaciones:</b> {p.recommendations}
        </div>
      )}
      {p.replacesFolio && <div className="mt-2 text-xs text-slate-500">Reemplaza a la receta {p.replacesFolio}</div>}
      {p.replacedByFolio && (
        <div className="mt-1 text-xs text-slate-500">Reemplazada por la receta {p.replacedByFolio}</div>
      )}

      <DocumentFooter lh={p.lh} />
    </DocumentPaper>
  );
}
