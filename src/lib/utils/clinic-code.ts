/**
 * CÓDIGO DE CONSULTORIO Y NOMBRE DE USUARIO.
 *
 * El código es la identidad corta y permanente del consultorio:
 *
 *   Clínica López → CLP     y sus usuarios: clp.carlos, clp.maria
 *
 * Es INMUTABLE. No cambia aunque el consultorio se renombre, porque los
 * usuarios ya creados lo llevan en su nombre de acceso: cambiarlo dejaría a la
 * gente sin poder entrar.
 *
 * Este archivo es lógica pura, sin base de datos, para poder probarlo.
 */

/** Palabras que no aportan al código. */
const VACIAS = new Set(["DE", "DEL", "LA", "EL", "LOS", "LAS", "Y", "E", "A", "AL", "EN"]);

const VOCALES = new Set(["A", "E", "I", "O", "U"]);

/** Quita acentos y deja solo letras y espacios. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // acentos
    .replace(/Ñ/gi, "N")
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Sugiere el código de 3 letras a partir del nombre.
 *
 * Regla: la inicial de cada palabra significativa. Si con eso no llegan 3
 * letras, se completa con las consonantes de la última palabra, y al final con
 * lo que sea.
 *
 *   "Centro Médico del Valle" → CMV   (tres palabras, tres iniciales)
 *   "Clínica López"           → CLP   (CL + la P de LóPez)
 *   "Dental Sonrisa"          → DSN   (DS + la N de SoNrisa)
 *
 * Es una SUGERENCIA: se puede ajustar al dar de alta el consultorio, y a partir
 * de ahí queda congelada. Ninguna regla automática acierta a lo que suena bien
 * en todos los casos — "Dental Sonrisa" se lee mejor como DSO.
 */
export function suggestClinicCode(name: string): string {
  const limpio = normalizar(name);
  if (!limpio) return "";

  const palabras = limpio.split(" ").filter((p) => p.length > 0);
  const significativas = palabras.filter((p) => !VACIAS.has(p));
  const usar = significativas.length > 0 ? significativas : palabras;

  let code = usar.map((p) => p[0]).join("");
  if (code.length >= 3) return code.slice(0, 3);

  // Faltan letras: se completan desde la última palabra, consonantes primero
  // porque distinguen mejor entre nombres parecidos.
  const ultima = usar[usar.length - 1] ?? "";
  const resto = ultima.slice(1).split("");
  const consonantes = resto.filter((c) => !VOCALES.has(c));

  for (const c of [...consonantes, ...resto]) {
    if (code.length >= 3) break;
    code += c;
  }

  // Nombre demasiado corto para sacar 3 letras: se repite la última en vez de
  // devolver un código de 1 o 2 caracteres.
  while (code.length > 0 && code.length < 3) {
    code += code[code.length - 1];
  }

  return code.slice(0, 3);
}

/**
 * Resuelve el choque de códigos.
 *
 * El código debe ser único en toda la plataforma. Si el sugerido ya existe se
 * le agrega un número: CLP → CLP2 → CLP3. Se prefiere eso a inventar otra
 * combinación de letras, que sería impredecible para quien da de alta.
 */
export function resolveClinicCode(base: string, ocupados: Set<string>): string {
  const code = base.toUpperCase();
  if (!ocupados.has(code)) return code;

  for (let n = 2; n < 1000; n++) {
    const intento = `${code}${n}`;
    if (!ocupados.has(intento)) return intento;
  }

  throw new Error(`No se pudo asignar un código a partir de ${code}.`);
}

/** Valida un código escrito a mano. */
export function isValidClinicCode(code: string): boolean {
  return /^[A-Z]{2,4}[0-9]{0,3}$/.test(code);
}

// ---------------------------------------------------------------------------

/**
 * Arma el nombre de acceso de un usuario secundario: `clp.carlos`.
 *
 * Toma SOLO el primer nombre. "María Fernanda González" → `clp.maria`. Los
 * nombres compuestos y los apellidos harían usuarios largos de teclear, y esto
 * lo escribe alguien todos los días para entrar.
 *
 * El rol NO va en el nombre de usuario: si mañana la secretaria pasa a
 * administrativa, conserva `clp.carlos` y solo cambia su rol en la base.
 */
export function suggestUsername(clinicCode: string, fullName: string): string {
  const limpio = normalizar(fullName);
  const primerNombre = limpio.split(" ")[0] ?? "";

  if (!primerNombre) return "";

  return `${clinicCode.toLowerCase()}.${primerNombre.toLowerCase()}`;
}

/**
 * Resuelve el choque de nombres de usuario: clp.carlos → clp.carlos2.
 *
 * El número va al final del nombre, no del código: `clp.carlos2` se lee como
 * "el segundo Carlos de CLP", que es exactamente lo que pasó.
 */
export function resolveUsername(base: string, ocupados: Set<string>): string {
  const username = base.toLowerCase();
  if (!ocupados.has(username)) return username;

  for (let n = 2; n < 1000; n++) {
    const intento = `${username}${n}`;
    if (!ocupados.has(intento)) return intento;
  }

  throw new Error(`No se pudo asignar un nombre de usuario a partir de ${base}.`);
}

/**
 * ¿El texto es un correo o un nombre de usuario?
 *
 * Lo usa el login, que acepta los dos: el usuario principal entra con su correo
 * y los secundarios con su nombre de usuario.
 */
export function looksLikeEmail(identifier: string): boolean {
  return identifier.includes("@");
}
