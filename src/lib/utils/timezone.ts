/**
 * ZONAS HORARIAS.
 *
 * El servidor de Railway corre en UTC. Cualquier cosa que signifique "el día"
 * —el fin del día, el inicio del día, "hoy"— tiene que calcularse en la zona
 * del CONSULTORIO, no en la del servidor: en Tijuana el día termina siete horas
 * después que en UTC, y esas siete horas ya rompieron algo real.
 *
 * Sin librerías: `Intl` ya sabe las reglas de horario de verano de cada zona y
 * viene en Node. Meter `date-fns-tz` o `luxon` por esto sería una dependencia
 * más que mantener para algo que la plataforma ya resuelve.
 */

/**
 * Cuántos milisegundos va la zona por delante de UTC en ESE instante.
 *
 * Se evalúa por instante y no por zona porque el horario de verano lo cambia:
 * Tijuana es UTC-8 en enero y UTC-7 en julio.
 */
function desfaseMs(instante: Date, zona: string): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instante);

  const p: Record<string, string> = {};
  for (const { type, value } of partes) p[type] = value;

  // Algunos entornos devuelven "24" para la medianoche con hour12:false.
  const hora = p.hour === "24" ? 0 : Number(p.hour);

  const comoSiFueraUTC = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    hora,
    Number(p.minute),
    Number(p.second)
  );

  // `comoSiFueraUTC` no lleva milisegundos: se comparan sin ellos.
  return comoSiFueraUTC - (instante.getTime() - instante.getMilliseconds());
}

/** Una hora de reloj de pared en una zona, convertida al instante real. */
function instanteDeParedEn(
  y: number,
  m: number,
  d: number,
  hh: number,
  mm: number,
  ss: number,
  ms: number,
  zona: string
): Date {
  const suposicion = Date.UTC(y, m - 1, d, hh, mm, ss, ms);

  // Dos pasadas: la primera estima el desfase, la segunda lo confirma con el
  // instante ya corregido. Hace falta porque el desfase depende del instante
  // que se está calculando — el clásico problema del huevo y la gallina en los
  // cambios de horario.
  const primero = new Date(suposicion - desfaseMs(new Date(suposicion), zona));
  const desfase = desfaseMs(primero, zona);

  return new Date(suposicion - desfase);
}

/** Qué día del calendario es ese instante en esa zona. */
export function fechaEnZona(instante: Date, zona: string): { y: number; m: number; d: number } {
  // en-CA da AAAA-MM-DD, que se parte sin ambigüedad.
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(instante)
    .split("-")
    .map(Number);

  return { y, m, d };
}

/**
 * El último milisegundo del día al que pertenece ese instante, EN ESA ZONA.
 *
 * Para un consultorio en Tijuana, el 4 de septiembre termina a las
 * 2026-09-05T06:59:59.999Z. Calcularlo con `setHours(23,59,59)` sobre un
 * servidor en UTC lo deja siete horas antes — y en la práctica eso significó
 * enlaces de prerregistro que nacían vencidos.
 */
export function finDelDiaEn(instante: Date, zona: string): Date {
  const { y, m, d } = fechaEnZona(instante, zona);
  return instanteDeParedEn(y, m, d, 23, 59, 59, 999, zona);
}

/**
 * El día de HOY en esa zona, como AAAA-MM-DD.
 *
 * Sustituye a `new Date().toISOString().slice(0, 10)`, que devuelve el día en
 * UTC. En Tijuana eso cambia de día a las 5 de la tarde: a partir de esa hora,
 * cualquier pantalla que compare contra "hoy" cree que ya es mañana y deja de
 * mostrar el día que la gente está viviendo.
 */
export function hoyEnZona(zona: string, ahora = new Date()): string {
  const { y, m, d } = fechaEnZona(ahora, zona);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
