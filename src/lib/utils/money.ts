/**
 * DINERO.
 *
 * Los importes se guardan como `Float`, que es lo que ya usan `Payment.amount`
 * y `Product.price`. No es el tipo ideal para dinero —0.1 + 0.2 no da 0.3 en
 * coma flotante—, pero cambiarlo obligaría a migrar tablas que hoy funcionan y
 * eso es justo el refactor que este módulo no debe traer. Lo que sí se hace es
 * REDONDEAR a dos decimales en cada operación, para que el error no se acumule
 * renglón a renglón y la suma de la cotización cuadre con lo impreso.
 */

/** Redondeo a centavos. Se aplica a cada paso, no solo al total. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** $1,234.50 */
export function formatMoney(n: number, currency = "MXN"): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(n);
}

/**
 * Importe de un renglón: (precio × cantidad) − descuento.
 *
 * El descuento es un IMPORTE, no un porcentaje: es lo que se negocia de viva
 * voz en el mostrador ("le dejo mil de los mil doscientos"). Nunca baja de
 * cero, porque un renglón negativo se convertiría en una nota de crédito
 * silenciosa dentro de una cotización.
 */
export function lineTotal(unitPrice: number, quantity: number, discount = 0): number {
  return round2(Math.max(0, round2(unitPrice * quantity) - discount));
}
