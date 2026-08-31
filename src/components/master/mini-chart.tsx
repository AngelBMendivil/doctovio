/**
 * Gráficas de barras mínimas, en SVG a mano.
 *
 * Sin librería de charts a propósito: son cuatro barras y una etiqueta, y una
 * dependencia nueva costaría más de lo que resuelve. Además el proyecto usa
 * componentes propios, no una biblioteca de UI.
 */

type Serie = { label: string; value: number; value2?: number };

export function BarChart({
  data,
  format = (n: number) => String(n),
  colors = ["fill-primary", "fill-accent"],
  legend,
}: {
  data: Serie[];
  format?: (n: number) => string;
  /** [serie principal, serie secundaria] */
  colors?: [string, string] | string[];
  legend?: [string, string];
}) {
  // El máximo define la escala. Con todo en cero se usa 1 para no dividir
  // entre cero y dibujar barras vacías en vez de romper.
  const max = Math.max(1, ...data.flatMap((d) => [d.value, d.value2 ?? 0]));
  const tieneSegunda = data.some((d) => d.value2 !== undefined);

  return (
    <div>
      {legend && (
        <div className="mb-3 flex gap-4 text-xs text-muted-foreground">
          {legend.map((l, i) => (
            <span key={l} className="flex items-center gap-1.5">
              <span className={`inline-block h-2 w-2 rounded-full ${colors[i]?.replace("fill-", "bg-")}`} />
              {l}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2" style={{ height: 140 }}>
        {data.map((d) => (
          <div key={d.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div className="flex h-full w-full items-end justify-center gap-0.5">
              <svg viewBox="0 0 10 100" preserveAspectRatio="none" className="h-full w-full max-w-[28px]">
                <rect
                  x="0"
                  y={100 - (d.value / max) * 100}
                  width="10"
                  height={(d.value / max) * 100}
                  className={colors[0]}
                  rx="0.6"
                />
              </svg>

              {tieneSegunda && (
                <svg viewBox="0 0 10 100" preserveAspectRatio="none" className="h-full w-full max-w-[28px]">
                  <rect
                    x="0"
                    y={100 - ((d.value2 ?? 0) / max) * 100}
                    width="10"
                    height={((d.value2 ?? 0) / max) * 100}
                    className={colors[1]}
                    rx="0.6"
                  />
                </svg>
              )}
            </div>

            <span className="truncate text-[11px] text-muted-foreground">{d.label}</span>
          </div>
        ))}
      </div>

      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>0</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}
