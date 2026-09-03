/**
 * Sustituto vacío de `server-only`.
 *
 * Ese paquete no existe fuera del runtime de Next: solo sirve para que el
 * bundler impida importar un módulo desde el cliente. En las pruebas no hay
 * bundler ni cliente, así que se reemplaza por nada.
 *
 * Se hace por alias en vitest.integration.mts y NO tocando el código: quitar
 * `import "server-only"` de los módulos reales eliminaría una protección
 * legítima de producción para conveniencia de las pruebas.
 */
export {};
