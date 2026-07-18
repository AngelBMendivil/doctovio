import { cn } from "@/lib/utils/cn";

/**
 * Marca Doctovio — punto único donde la app consume el logotipo.
 *
 * Hoy el logo se dibuja en SVG aquí mismo (no se carga ningún archivo), así que
 * siempre se ve, sin depender de public/ ni del servidor de estáticos.
 *
 * ▸ PARA PONER EL LOGO OFICIAL:
 *   1. Deja tus archivos en public/brand/ con estos nombres:
 *        doctovio-horizontal.png         fondos claros (login, encabezado móvil)
 *        doctovio-horizontal-blanco.png  fondos oscuros (sidebar navy)
 *        doctovio-isotipo.png            cuadrado (sidebar colapsada, avatar)
 *   2. Cambia USE_FILES a true (y EXT si son .svg).
 *   3. Reinicia el server la primera vez (Next registra public/ al arrancar).
 */
const USE_FILES = false; // ← ponlo en true cuando existan los archivos
const EXT = "png"; // "png" | "svg" | "webp"

const BRAND = {
  isotipo: `/brand/doctovio-isotipo.${EXT}`,
  horizontal: `/brand/doctovio-horizontal.${EXT}`,
  horizontalBlanco: `/brand/doctovio-horizontal-blanco.${EXT}`,
} as const;

/** Degradado de la marca: turquesa → azul. */
function GradDef({ id, variant }: { id: string; variant: "color" | "blanco" }) {
  return (
    <defs>
      <linearGradient id={id} x1="8" y1="58" x2="58" y2="8" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#14B8A6" />
        <stop offset="0.55" stopColor={variant === "blanco" ? "#3BA9D6" : "#1B8FB8"} />
        <stop offset="1" stopColor={variant === "blanco" ? "#4E9FD8" : "#1464A4"} />
      </linearGradient>
    </defs>
  );
}

/** La "D" del isotipo. */
function DGlyph({ gradId }: { gradId: string }) {
  return (
    <>
      <path
        d="M20 9 H33 a23 23 0 0 1 0 46 H20 a1 1 0 0 1 -1 -1 V33"
        stroke={`url(#${gradId})`}
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="41" cy="18" r="3.5" fill="#14B8A6" />
    </>
  );
}

export function Isotipo({ className }: { className?: string }) {
  const cls = cn("h-9 w-9 shrink-0 object-contain", className);

  if (USE_FILES) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={BRAND.isotipo} alt="Doctovio" className={cls} draggable={false} />;
  }

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label="Doctovio"
      preserveAspectRatio="xMidYMid meet"
      className={cls}
    >
      <GradDef id="dv-iso" variant="color" />
      <DGlyph gradId="dv-iso" />
    </svg>
  );
}

export function LogoHorizontal({
  variant = "color",
  className,
}: {
  /** "color" para fondos claros · "blanco" para fondos oscuros */
  variant?: "color" | "blanco";
  className?: string;
}) {
  // El logo nunca se deforma: se escala por altura con ancho automático.
  const cls = cn("h-10 w-auto object-contain object-left", className);

  if (USE_FILES) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={variant === "blanco" ? BRAND.horizontalBlanco : BRAND.horizontal}
        alt="Doctovio — Gestión médica que fluye"
        className={cls}
        draggable={false}
      />
    );
  }

  const gradId = variant === "blanco" ? "dv-h-blanco" : "dv-h-color";
  return (
    <svg
      viewBox="0 0 260 64"
      fill="none"
      role="img"
      aria-label="Doctovio — Gestión médica que fluye"
      // Ancla el dibujo a la izquierda: si el contenedor estira el SVG,
      // el logo no se va al centro.
      preserveAspectRatio="xMinYMid meet"
      className={cls}
    >
      <GradDef id={gradId} variant={variant} />
      <DGlyph gradId={gradId} />
      <text
        x="76"
        y="37"
        fontFamily="'Plus Jakarta Sans', system-ui, sans-serif"
        fontSize="26"
        fontWeight="700"
        letterSpacing="-0.6"
        fill={variant === "blanco" ? "#FFFFFF" : "#0D2B45"}
      >
        Doctovio
      </text>
      <text
        x="77"
        y="51"
        fontFamily="'Plus Jakarta Sans', system-ui, sans-serif"
        fontSize="8.5"
        fontWeight="500"
        fill={variant === "blanco" ? "#A6E7E1" : "#6B7280"}
      >
        Gestión médica que fluye.
      </text>
    </svg>
  );
}

/** Eslogan oficial, por si se necesita como texto seleccionable. */
export const TAGLINE = "Gestión médica que fluye";
