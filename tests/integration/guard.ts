import { db } from "@/lib/db";

/**
 * Acceso a la base de pruebas para las suites de integración.
 *
 * Devuelve EL MISMO cliente que usan los servicios (`@/lib/db`), no uno
 * aparte. Esa es la corrección importante: si la prueba usara un cliente
 * propio, `crearCita()` y compañía seguirían escribiendo por su cuenta contra
 * `process.env.DATABASE_URL`, que sin la redirección es producción.
 *
 * La validación pesada vive en `setup.ts`, que corre ANTES que cualquier
 * módulo y redirige `DATABASE_URL` a la base de pruebas tras comprobar la
 * marca de QA. Aquí solo se confirma que esa redirección ocurrió: si alguien
 * quita el setup del config, esto lo detiene.
 */

const BASE_ESPERADA = "doctovio_test";

function baseActual(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("ABORTADO: no hay DATABASE_URL.");
  return new URL(url).pathname.replace("/", "");
}

export async function testDb() {
  const nombre = baseActual();

  if (nombre !== BASE_ESPERADA) {
    throw new Error(
      `ABORTADO: los servicios apuntan a "${nombre}", no a "${BASE_ESPERADA}".\n` +
        `Falta tests/integration/setup.ts en setupFiles del config.`
    );
  }

  // Se confirma contra la base real, no contra la cadena de conexión: la
  // cadena puede mentir, la fila no.
  const marca = await db.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM "_qa_marker" WHERE id = 'DOCTOVIO_QA'`
  );
  if (marca.length === 0) {
    throw new Error(`ABORTADO: la base conectada no tiene la marca de QA.`);
  }

  return db;
}

export async function closeTestDb() {
  await db.$disconnect();
}

/**
 * Código de consultorio único por corrida.
 *
 * Cada suite trabaja sobre el suyo, así que dos suites nunca se pisan y —sobre
 * todo— nunca se tocan los consultorios que vinieron en la copia de
 * producción, que llevan datos clínicos reales.
 */
export function codigoUnico(prefijo = "QA"): string {
  return `${prefijo}${Date.now().toString(36).slice(-4).toUpperCase()}`;
}
