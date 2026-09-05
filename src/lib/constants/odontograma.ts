import type { ToothSurface } from "@prisma/client";

/**
 * ODONTOGRAMA — numeración, catálogo y reglas de la boca.
 *
 * Archivo plano, sin base de datos: se importa desde el servidor y desde el
 * navegador, y se puede probar sin montar nada.
 *
 * NOTACIÓN FDI (ISO 3950), la que se usa en México. Dos dígitos:
 *
 *      18 17 16 15 14 13 12 11 | 21 22 23 24 25 26 27 28
 *      48 47 46 45 44 43 42 41 | 31 32 33 34 35 36 37 38
 *
 * El primer dígito es el cuadrante visto DESDE EL PACIENTE: 1 arriba a su
 * derecha, 2 arriba a su izquierda, 3 abajo izquierda, 4 abajo derecha. El
 * segundo es la pieza contando desde la línea media, 1 (incisivo central) a 8
 * (tercer molar).
 *
 * Ojo con esto al dibujar: el cuadrante 1 es la DERECHA del paciente, que en la
 * pantalla queda a la IZQUIERDA — como si lo tuvieras enfrente. Invertirlo es
 * el error clásico, y significa registrar el tratamiento en el lado equivocado
 * de la boca.
 *
 * Los temporales (dientes de leche) usan cuadrantes 5 a 8 y piezas 1 a 5.
 */

export type Dentition = "PERMANENT" | "DECIDUOUS";

/** Cuadrantes en el orden en que se dibujan, de arriba-derecha del paciente. */
export const QUADRANTS = {
  PERMANENT: {
    upperRight: [18, 17, 16, 15, 14, 13, 12, 11],
    upperLeft: [21, 22, 23, 24, 25, 26, 27, 28],
    lowerRight: [48, 47, 46, 45, 44, 43, 42, 41],
    lowerLeft: [31, 32, 33, 34, 35, 36, 37, 38],
  },
  DECIDUOUS: {
    upperRight: [55, 54, 53, 52, 51],
    upperLeft: [61, 62, 63, 64, 65],
    lowerRight: [85, 84, 83, 82, 81],
    lowerLeft: [71, 72, 73, 74, 75],
  },
} as const;

/** Todos los códigos de una dentición, en orden de dibujo. */
export function allTeeth(d: Dentition): string[] {
  const q = QUADRANTS[d];
  return [...q.upperRight, ...q.upperLeft, ...q.lowerRight, ...q.lowerLeft].map(String);
}

/** ¿El código es una pieza válida en notación FDI? */
export function isValidTooth(code: string): boolean {
  return allTeeth("PERMANENT").includes(code) || allTeeth("DECIDUOUS").includes(code);
}

export function dentitionOf(code: string): Dentition | null {
  if (allTeeth("PERMANENT").includes(code)) return "PERMANENT";
  if (allTeeth("DECIDUOUS").includes(code)) return "DECIDUOUS";
  return null;
}

/** Arriba (maxilar) o abajo (mandíbula). Define si la cara interna es palatina o lingual. */
export function isUpper(code: string): boolean {
  return ["1", "2", "5", "6"].includes(code[0]);
}

/**
 * Anterior (incisivos y caninos) o posterior (premolares y molares).
 *
 * Define el nombre de la cara masticatoria: incisal adelante, oclusal atrás.
 */
export function isAnterior(code: string): boolean {
  const pieza = Number(code[1]);
  return pieza >= 1 && pieza <= 3;
}

/**
 * Nombre de la superficie PARA ESA PIEZA.
 *
 * Dos caras cambian de nombre según dónde esté el diente, y llamarlas mal en la
 * historia clínica confunde a quien la lea después.
 */
export function surfaceLabel(surface: ToothSurface, toothCode: string): string {
  switch (surface) {
    case "VESTIBULAR":
      return "Vestibular";
    case "PALATAL_LINGUAL":
      return isUpper(toothCode) ? "Palatina" : "Lingual";
    case "MESIAL":
      return "Mesial";
    case "DISTAL":
      return "Distal";
    case "OCCLUSAL_INCISAL":
      return isAnterior(toothCode) ? "Incisal" : "Oclusal";
    case "WHOLE":
      return "Pieza completa";
  }
}

/** Superficies que se le pueden marcar a una pieza, en orden de captura. */
export const SURFACES: ToothSurface[] = [
  "VESTIBULAR",
  "MESIAL",
  "OCCLUSAL_INCISAL",
  "DISTAL",
  "PALATAL_LINGUAL",
];

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

export type OdontogramCode = {
  code: string;
  label: string;
  /** Color con el que se pinta en el diagrama. */
  color: string;
  /** Afecta al diente entero: no tiene sentido pedir superficies. */
  wholeTooth?: boolean;
};

/**
 * Hallazgos: lo que el dentista ENCUENTRA.
 *
 * Rojo por convención odontológica: lo que está mal se marca en rojo, lo ya
 * tratado en azul. Es la convención de los odontogramas en papel y respetarla
 * evita que alguien lea el diagrama al revés.
 */
export const FINDINGS: OdontogramCode[] = [
  { code: "CARIES", label: "Caries", color: "#DC2626" },
  { code: "FRACTURA", label: "Fractura", color: "#DC2626" },
  { code: "DESGASTE", label: "Desgaste / atrición", color: "#DC2626" },
  { code: "MOVILIDAD", label: "Movilidad", color: "#DC2626", wholeTooth: true },
  { code: "AUSENTE", label: "Ausente", color: "#6B7280", wholeTooth: true },
  { code: "NO_ERUPCIONADO", label: "No erupcionado", color: "#6B7280", wholeTooth: true },
  { code: "IMPACTADO", label: "Impactado / retenido", color: "#B45309", wholeTooth: true },
  { code: "RECESION", label: "Recesión gingival", color: "#DC2626" },
  { code: "SENSIBILIDAD", label: "Sensibilidad", color: "#B45309" },
];

/** Tratamientos: lo que se HACE. Azul, por la misma convención. */
export const TREATMENTS: OdontogramCode[] = [
  { code: "RESINA", label: "Resina", color: "#2563EB" },
  { code: "AMALGAMA", label: "Amalgama", color: "#334155" },
  { code: "SELLADOR", label: "Sellador", color: "#0891B2" },
  { code: "INCRUSTACION", label: "Incrustación", color: "#2563EB" },
  { code: "CORONA", label: "Corona", color: "#7C3AED", wholeTooth: true },
  { code: "ENDODONCIA", label: "Endodoncia", color: "#7C3AED", wholeTooth: true },
  { code: "EXTRACCION", label: "Extracción", color: "#DC2626", wholeTooth: true },
  { code: "IMPLANTE", label: "Implante", color: "#059669", wholeTooth: true },
  { code: "PROTESIS", label: "Prótesis", color: "#059669", wholeTooth: true },
  { code: "LIMPIEZA", label: "Limpieza / profilaxis", color: "#0891B2", wholeTooth: true },
  { code: "ORTODONCIA", label: "Ortodoncia", color: "#DB2777", wholeTooth: true },
];

const TODOS = [...FINDINGS, ...TREATMENTS];

export function findCode(code: string): OdontogramCode | undefined {
  return TODOS.find((c) => c.code === code);
}

export function codeLabel(code: string): string {
  return findCode(code)?.label ?? code;
}

export function codeColor(code: string): string {
  return findCode(code)?.color ?? "#6B7280";
}

/** Los que aplican al diente entero no piden superficies. */
export function isWholeToothCode(code: string): boolean {
  return findCode(code)?.wholeTooth === true;
}

export const STATUS_LABEL: Record<string, string> = {
  PLANNED: "Planeado",
  IN_PROGRESS: "En proceso",
  COMPLETED: "Terminado",
  CANCELLED: "Cancelado",
};

// ---------------------------------------------------------------------------
// Cómo se pinta el diagrama
// ---------------------------------------------------------------------------

/**
 * Las tres capas del odontograma, con su color.
 *
 * El diagrama NO se pinta con el color del código, sino con el de la CAPA: lo
 * que el dentista necesita ver de un vistazo es qué está mal, qué falta por
 * hacer y qué ya se hizo — no de qué material fue la restauración.
 *
 * El color va SIEMPRE acompañado de una letra y de texto en el panel. Un
 * diagrama que solo se entiende a color deja fuera a quien no distingue el rojo
 * del verde, que es alrededor de uno de cada doce hombres.
 */
export type ToothLayer = "FINDING" | "PLANNED" | "DONE" | "MISSING";

export const LAYERS: Record<ToothLayer, { label: string; color: string; letra: string }> = {
  FINDING: { label: "Hallazgo", color: "#DC2626", letra: "H" },
  PLANNED: { label: "Planeado", color: "#D97706", letra: "P" },
  DONE: { label: "Realizado", color: "#059669", letra: "R" },
  MISSING: { label: "Ausente", color: "#9CA3AF", letra: "—" },
};

/** Códigos que dejan la pieza fuera de la boca: se pinta gris y tachada. */
const AUSENTES = ["AUSENTE", "EXTRACCION", "NO_ERUPCIONADO"];

export function isMissingCode(code: string): boolean {
  return AUSENTES.includes(code);
}

/**
 * De qué lado del dibujo queda la cara MESIAL de esta pieza.
 *
 * Mesial es "hacia la línea media" y distal "hacia atrás". Como los cuadrantes
 * 1 y 4 se dibujan a la izquierda de la pantalla, su mesial queda a la DERECHA
 * del cuadrito; en los cuadrantes 2 y 3 es al revés.
 *
 * Sin esto, la mitad de la boca queda espejeada: se marca una caries distal
 * donde el paciente tiene la mesial.
 */
export function mesialSide(toothCode: string): "left" | "right" {
  const cuadrante = toothCode[0];
  // 1 y 4 (permanentes), 5 y 8 (temporales) son el lado derecho del paciente.
  return ["1", "4", "5", "8"].includes(cuadrante) ? "right" : "left";
}

const NOMBRE_PERMANENTE = [
  "",
  "Incisivo central",
  "Incisivo lateral",
  "Canino",
  "Primer premolar",
  "Segundo premolar",
  "Primer molar",
  "Segundo molar",
  "Tercer molar",
];

const NOMBRE_TEMPORAL = [
  "",
  "Incisivo central",
  "Incisivo lateral",
  "Canino",
  "Primer molar",
  "Segundo molar",
];

/**
 * Nombre de la pieza: "Primer molar superior derecho".
 *
 * Derecho e izquierdo son los DEL PACIENTE, no los de la pantalla. Es lo que se
 * dicta en voz alta y lo que se escribe en el expediente.
 */
export function toothName(code: string): string {
  const dent = dentitionOf(code);
  if (!dent) return code;

  const pieza = Number(code[1]);
  const base = dent === "PERMANENT" ? NOMBRE_PERMANENTE[pieza] : NOMBRE_TEMPORAL[pieza];
  const arriba = isUpper(code) ? "superior" : "inferior";
  const derecha = ["1", "4", "5", "8"].includes(code[0]) ? "derecho" : "izquierdo";
  const temporal = dent === "DECIDUOUS" ? " temporal" : "";

  return `${base} ${arriba} ${derecha}${temporal}`;
}

// ---------------------------------------------------------------------------
// Catálogo del consultorio
// ---------------------------------------------------------------------------

/**
 * Categorías sugeridas al abrir por primera vez Productos y Servicios.
 *
 * Se siembran las CATEGORÍAS, nunca los productos: los precios son de cada
 * consultorio y sembrar una "Resina $850" inventada acabaría cotizándose tal
 * cual el día que alguien no la revise.
 */
export const CATEGORIAS_SUGERIDAS = [
  "Diagnóstico",
  "Preventivo",
  "Restaurativo",
  "Endodoncia",
  "Cirugía",
  "Periodoncia",
  "Ortodoncia",
  "Prótesis",
  "Implantología",
  "Estética",
  "Productos",
  "Otros",
];

export const TREATMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  ACCEPTED: "Aceptado",
  IN_PROGRESS: "En tratamiento",
  COMPLETED: "Realizado",
  CANCELLED: "Cancelado",
};

export const QUOTE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  SENT: "Enviada",
  ACCEPTED: "Aceptada",
  REJECTED: "Rechazada",
  PARTIAL: "Aceptada en parte",
  CANCELLED: "Cancelada",
};
