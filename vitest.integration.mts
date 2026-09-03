import { defineConfig } from "vitest/config";
import { resolve } from "path";

/**
 * Pruebas de INTEGRACIÓN: escriben en la base de pruebas.
 *
 * Config aparte de la unitaria a propósito. `npm test` nunca debe arrastrar
 * estas: son lentas (van por red) y tocan datos. Se corren con
 * `npm run test:integration`, de forma deliberada.
 *
 * Todas obtienen su cliente de tests/integration/guard.ts, que se niega a
 * conectar si la base no lleva la marca de QA.
 */
export default defineConfig({
  resolve: {
    alias: { "@": resolve(import.meta.dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    // En serie: varias suites escribiendo a la vez en la misma base se pisan,
    // y un fallo intermitente en pruebas de concurrencia no sirve de nada.
    fileParallelism: false,
    // Van por red a Railway: más margen que las unitarias.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
