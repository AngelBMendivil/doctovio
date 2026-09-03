import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

/**
 * ARRANQUE DE LAS PRUEBAS DE INTEGRACIÓN. Corre ANTES que cualquier otro
 * módulo, y esa precedencia es justamente el punto.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 *
 * La primera versión de la guarda entregaba a las pruebas un cliente apuntando
 * a la base de pruebas... pero los SERVICIOS no usan ese cliente. Importan el
 * singleton de `@/lib/db`, que lee `process.env.DATABASE_URL` al cargarse — o
 * sea, el `.env` de PRODUCCIÓN.
 *
 * Resultado: `crearCita()` en una prueba escribía contra producción. Lo único
 * que lo impidió fue que el consultorio de QA no existe allá y la llave foránea
 * falló. Con un id de producción habría creado citas reales.
 *
 * Por eso aquí se REESCRIBE `process.env.DATABASE_URL` antes de que nadie
 * importe `@/lib/db`. Así el singleton nace apuntando a la base de pruebas y
 * los servicios quedan cubiertos sin tener que modificarlos.
 *
 * Este archivo NO debe importar `@/lib/db` ni ningún servicio: hacerlo fijaría
 * el singleton contra producción antes de la redirección.
 */

const BASE_ESPERADA = "doctovio_test";
const MARCA = "DOCTOVIO_QA";

function leerUrl(archivo: string): string | null {
  try {
    const linea = readFileSync(archivo, "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith("DATABASE_URL="));
    return linea?.slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "") ?? null;
  } catch {
    return null;
  }
}

const urlPruebas = leerUrl(".env.test");
if (!urlPruebas) {
  throw new Error(
    "ABORTADO: falta .env.test con la DATABASE_URL de la base de pruebas.\n" +
      "Las pruebas de integración NO usan el .env de producción, a propósito."
  );
}

const nombrePruebas = new URL(urlPruebas).pathname.replace("/", "");
const urlProduccion = leerUrl(".env");
const nombreProduccion = urlProduccion ? new URL(urlProduccion).pathname.replace("/", "") : null;

// 1. El nombre debe ser exactamente el esperado.
if (nombrePruebas !== BASE_ESPERADA) {
  throw new Error(
    `ABORTADO: .env.test apunta a "${nombrePruebas}", no a "${BASE_ESPERADA}".\n` +
      `Estas pruebas escriben: no se ejecutan contra una base desconocida.`
  );
}

// 2. Y jamás puede ser la misma que producción.
if (nombreProduccion && urlPruebas === urlProduccion) {
  throw new Error(`ABORTADO: .env.test y .env apuntan a la MISMA base ("${nombreProduccion}").`);
}

// 3. La marca. Comparar cadenas no basta: alguien puede copiar el archivo,
//    cambiar el host y dejar el nombre correcto apuntando a otro servidor.
//    Esta fila solo existe en la base de pruebas.
const sonda = new PrismaClient({ datasources: { db: { url: urlPruebas } } });
try {
  const filas = await sonda.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM "_qa_marker" WHERE id = '${MARCA}'`
  );
  if (filas.length === 0) throw new Error("sin marca");
} catch {
  await sonda.$disconnect();
  throw new Error(
    `ABORTADO: la base "${nombrePruebas}" no tiene la marca ${MARCA}.\n` +
      `Sin esa fila no hay forma de asegurar que no sea producción, así que no se toca.`
  );
}
await sonda.$disconnect();

// LO IMPORTANTE: redirigir el singleton antes de que exista.
process.env.DATABASE_URL = urlPruebas;

console.log(`[pruebas] base: ${nombrePruebas} · marca ${MARCA} verificada`);
