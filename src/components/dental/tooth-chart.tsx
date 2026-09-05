"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  QUADRANTS,
  LAYERS,
  mesialSide,
  isUpper,
  toothName,
  surfaceLabel,
  type Dentition,
  type ToothLayer,
} from "@/lib/constants/odontograma";
import type { ToothSurface } from "@prisma/client";
import { cn } from "@/lib/utils/cn";

/**
 * EL DIAGRAMA.
 *
 * Cada pieza es un cuadro partido en cinco caras. Dos cosas que parecen detalle
 * y no lo son:
 *
 * 1. El cuadrante 1 se dibuja a la IZQUIERDA de la pantalla, porque es la
 *    derecha del paciente y el odontograma se lee como si lo tuvieras enfrente.
 * 2. La cara MESIAL cambia de lado según el cuadrante: es la que mira a la
 *    línea media. Espejearla marca la caries en la cara contraria.
 *
 * La pieza seleccionada va en la URL (`?diente=16`), no en `useState`: al
 * guardar algo, la acción revalida y el árbol se vuelve a renderizar: con
 * estado local el panel se cerraría solo justo después de capturar.
 */

export type ChartMark = { layer: ToothLayer; label: string };

export type ChartTooth = {
  surfaces: Partial<Record<ToothSurface, ChartMark>>;
  whole: ChartMark[];
  missing: boolean;
  total: number;
  pendientes: number;
};

const S = 30; // lado del cuadro de la pieza
const I = 9; // grosor de las caras exteriores
const NEUTRO = "#FFFFFF";
const BORDE = "#94A3B8";

/** Las cuatro esquinas de cada cara, para dibujarlas como polígonos. */
const ZONAS = {
  top: `0,0 ${S},0 ${S - I},${I} ${I},${I}`,
  bottom: `0,${S} ${S},${S} ${S - I},${S - I} ${I},${S - I}`,
  left: `0,0 ${I},${I} ${I},${S - I} 0,${S}`,
  right: `${S},0 ${S - I},${I} ${S - I},${S - I} ${S},${S}`,
};

/** Qué superficie es cada zona del dibujo, para ESTA pieza. */
function mapaDeCaras(code: string): Record<keyof typeof ZONAS | "center", ToothSurface> {
  const arriba = isUpper(code);
  const mesialDerecha = mesialSide(code) === "right";
  return {
    top: arriba ? "VESTIBULAR" : "PALATAL_LINGUAL",
    bottom: arriba ? "PALATAL_LINGUAL" : "VESTIBULAR",
    right: mesialDerecha ? "MESIAL" : "DISTAL",
    left: mesialDerecha ? "DISTAL" : "MESIAL",
    center: "OCCLUSAL_INCISAL",
  };
}

function Tooth({
  code,
  estado,
  seleccionado,
  onSelect,
}: {
  code: string;
  estado?: ChartTooth;
  seleccionado: boolean;
  onSelect: (code: string) => void;
}) {
  const caras = mapaDeCaras(code);
  const color = (s: ToothSurface) => {
    const marca = estado?.surfaces[s];
    return marca ? LAYERS[marca.layer].color : NEUTRO;
  };

  // Lo que aplica a la pieza entera se dibuja como un aro alrededor del cuadro.
  const aro = estado?.whole.at(-1);

  // Texto para quien no ve el color, y para el lector de pantalla.
  const resumen = estado
    ? [
        ...Object.entries(estado.surfaces).map(
          ([s, m]) => `${surfaceLabel(s as ToothSurface, code)}: ${m.label} (${LAYERS[m.layer].label})`
        ),
        ...estado.whole.map((m) => `${m.label} (${LAYERS[m.layer].label})`),
      ].join(". ")
    : "Sin anotaciones";

  const letra = estado?.missing
    ? LAYERS.MISSING.letra
    : estado?.pendientes
      ? LAYERS.PLANNED.letra
      : aro
        ? LAYERS[aro.layer].letra
        : null;

  return (
    <button
      type="button"
      onClick={() => onSelect(code)}
      aria-label={`Pieza ${code}, ${toothName(code)}. ${resumen}`}
      aria-pressed={seleccionado}
      title={`${code} · ${toothName(code)}\n${resumen}`}
      className={cn(
        "group flex flex-col items-center rounded-md px-0.5 py-1 transition-colors",
        seleccionado ? "bg-primary/10 ring-2 ring-primary" : "hover:bg-muted"
      )}
    >
      <span className="mb-0.5 text-[10px] font-semibold leading-none text-muted-foreground">{code}</span>

      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} role="presentation" className="overflow-visible">
        <polygon points={ZONAS.top} fill={color(caras.top)} stroke={BORDE} strokeWidth="0.6" />
        <polygon points={ZONAS.bottom} fill={color(caras.bottom)} stroke={BORDE} strokeWidth="0.6" />
        <polygon points={ZONAS.left} fill={color(caras.left)} stroke={BORDE} strokeWidth="0.6" />
        <polygon points={ZONAS.right} fill={color(caras.right)} stroke={BORDE} strokeWidth="0.6" />
        <rect
          x={I}
          y={I}
          width={S - I * 2}
          height={S - I * 2}
          fill={color(caras.center)}
          stroke={BORDE}
          strokeWidth="0.6"
        />

        {aro && !estado?.missing && (
          <rect
            x="-2"
            y="-2"
            width={S + 4}
            height={S + 4}
            rx="3"
            fill="none"
            stroke={LAYERS[aro.layer].color}
            strokeWidth="2"
          />
        )}

        {/* Ausente: gris y tachada. La cruz es lo que se lee sin color. */}
        {estado?.missing && (
          <>
            <rect x="0" y="0" width={S} height={S} fill={LAYERS.MISSING.color} fillOpacity="0.35" />
            <line x1="1" y1="1" x2={S - 1} y2={S - 1} stroke="#475569" strokeWidth="1.6" />
            <line x1={S - 1} y1="1" x2="1" y2={S - 1} stroke="#475569" strokeWidth="1.6" />
          </>
        )}
      </svg>

      {/* La letra dice lo mismo que el color, para quien no lo distingue. */}
      <span className="mt-1 h-3 text-[9px] font-bold leading-none text-muted-foreground">{letra ?? ""}</span>
    </button>
  );
}

function Fila({
  piezas,
  estados,
  seleccionado,
  onSelect,
}: {
  piezas: readonly (readonly number[])[];
  estados: Record<string, ChartTooth>;
  seleccionado: string | null;
  onSelect: (c: string) => void;
}) {
  return (
    <div className="flex items-start justify-center gap-3">
      {piezas.map((cuadrante, i) => (
        <div key={i} className="flex items-start gap-0.5">
          {i === 1 && <div className="mx-1 h-16 w-px self-center bg-border" />}
          {cuadrante.map((n) => {
            const code = String(n);
            return (
              <Tooth
                key={code}
                code={code}
                estado={estados[code]}
                seleccionado={seleccionado === code}
                onSelect={onSelect}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function ToothChart({
  dentition,
  estados,
  seleccionado,
}: {
  dentition: Dentition;
  estados: Record<string, ChartTooth>;
  seleccionado: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const select = (code: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (params.get("diente") === code) params.delete("diente");
    else params.set("diente", code);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const q = QUADRANTS[dentition];

  return (
    <div className="space-y-4">
      {/* En una pantalla chica el arco no cabe: se desplaza en su propia caja
          en vez de encoger las piezas hasta que no se puedan tocar. */}
      <div className="overflow-x-auto pb-2">
        <div className="mx-auto w-max space-y-3">
          <Fila
            piezas={[q.upperRight, q.upperLeft]}
            estados={estados}
            seleccionado={seleccionado}
            onSelect={select}
          />
          <div className="h-px bg-border" />
          <Fila
            piezas={[q.lowerRight, q.lowerLeft]}
            estados={estados}
            seleccionado={seleccionado}
            onSelect={select}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs">
        {(Object.keys(LAYERS) as ToothLayer[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-sm border border-border"
              style={{ backgroundColor: LAYERS[k].color }}
            />
            <span className="font-bold text-muted-foreground">{LAYERS[k].letra}</span>
            <span className="text-muted-foreground">{LAYERS[k].label}</span>
          </span>
        ))}
        <span className="text-muted-foreground">
          Derecha e izquierda son las <strong>del paciente</strong>.
        </span>
      </div>
    </div>
  );
}
