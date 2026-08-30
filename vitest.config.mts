import { defineConfig } from "vitest/config";
import { resolve } from "path";

/**
 * Configuración de pruebas.
 *
 * Primera tanda: SOLO lógica pura, nada que toque Prisma. Las pruebas de
 * aislamiento entre consultorios —las de mayor valor— necesitan una base de
 * datos propia y quedaron pendientes de que exista una.
 *
 * REGLA QUE NO SE NEGOCIA: ninguna prueba corre contra producción. Por eso
 * `include` está acotado a `tests/unit`: si algún día se agregan pruebas con
 * base, van en otra carpeta y con su propia guarda que verifique a qué base
 * apunta antes de escribir una sola fila.
 */
export default defineConfig({
  resolve: {
    // Mismo alias que tsconfig.json, para importar igual que la app.
    alias: { "@": resolve(import.meta.dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    // Sin base de datos de por medio, una prueba que tarda más de 5 s está
    // colgada, no lenta.
    testTimeout: 5000,
  },
});
