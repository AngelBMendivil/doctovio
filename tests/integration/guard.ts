import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

/**
 * GUARDA DE LA BASE DE PRUEBAS.
 *
 * Las suites de integración BORRAN datos. Si alguna vez apuntaran a producción,
 * se llevarían los expedientes clínicos de pacientes reales. Esta guarda es lo
 * único que separa una cosa de la otra, así que es deliberadamente paranoica y
 * falla cerrado: ante cualquier duda, aborta.
 *
 * Tres comprobaciones, en orden de fuerza:
 *
 *   1. El nombre de la base debe ser `doctovio_test`.
 *   2. NO debe llamarse como la base de producción.
 *   3. Debe existir la fila `_qa_marker` = 'DOCTOVIO_QA'.
 *
 * La tercera es la que de verdad protege. Las dos primeras miran una cadena de
 * texto, y una cadena se puede equivocar: alguien copia `.env.test`, cambia el
 * host y deja el nombre. La marca no: es una fila que solo existe en la base de
 * pruebas, puesta a mano al crearla. Producción no la tiene y nunca debe
 * tenerla.
 */

const BASE_ESPERADA = "doctovio_test";
const MARCA = "DOCTOVIO_QA";

function urlDePruebas(): string {
  let url: string | undefined;
  try {
    const linea = readFileSync(".env.test", "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith("DATABASE_URL="));
    url = linea?.slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "");
  } catch {
    throw new Error(
      "Falta .env.test con la DATABASE_URL de la base de pruebas.\n" +
        "Las pruebas de integración NO usan el .env de producción a propósito."
    );
  }
  if (!url) throw new Error("No hay DATABASE_URL en .env.test.");
  return url;
}

/** Nombre de la base de producción, para comparar contra él. */
function baseDeProduccion(): string | null {
  try {
    const linea = readFileSync(".env", "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith("DATABASE_URL="));
    const url = linea?.slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "");
    return url ? new URL(url).pathname.replace("/", "") : null;
  } catch {
    return null;
  }
}

let cliente: PrismaClient | null = null;

/**
 * Devuelve el cliente de la base de pruebas, o lanza.
 *
 * Toda suite de integración DEBE obtener su cliente de aquí. Instanciar un
 * PrismaClient por su cuenta se salta la guarda entera.
 */
export async function testDb(): Promise<PrismaClient> {
  if (cliente) return cliente;

  const url = urlDePruebas();
  const nombre = new URL(url).pathname.replace("/", "");

  // 1. El nombre debe ser el esperado.
  if (nombre !== BASE_ESPERADA) {
    throw new Error(
      `ABORTADO: .env.test apunta a "${nombre}", no a "${BASE_ESPERADA}".\n` +
        `Las pruebas borran datos: no se ejecutan contra una base desconocida.`
    );
  }

  // 2. Y jamás puede coincidir con la de producción.
  const prod = baseDeProduccion();
  if (prod && prod === nombre) {
    throw new Error(`ABORTADO: .env.test apunta a la MISMA base que .env ("${prod}").`);
  }

  const db = new PrismaClient({ datasources: { db: { url } } });

  // 3. La marca. Esta es la que de verdad protege.
  try {
    const filas = await db.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "_qa_marker" WHERE id = '${MARCA}'`
    );
    if (filas.length === 0) throw new Error("sin marca");
  } catch {
    await db.$disconnect();
    throw new Error(
      `ABORTADO: la base "${nombre}" no tiene la marca ${MARCA}.\n` +
        `Sin esa fila no hay forma de asegurar que no sea producción, así que no se toca.`
    );
  }

  cliente = db;
  return db;
}

export async function closeTestDb() {
  await cliente?.$disconnect();
  cliente = null;
}

/**
 * Consultorio de trabajo para una suite, aislado del resto.
 *
 * Cada suite crea el suyo con un código único, así dos suites en paralelo no se
 * pisan. Sobre todo: nunca se toca ninguno de los consultorios que venían en la
 * copia de producción, que son los que llevan datos clínicos reales.
 */
export function codigoUnico(prefijo = "QA"): string {
  return `${prefijo}${Date.now().toString(36).slice(-4).toUpperCase()}`;
}
