import { db } from "@/lib/db";
import type { BillingFrequency } from "@prisma/client";

/**
 * CATÁLOGO DE PRODUCTOS Y SUSCRIPCIONES.
 *
 * Regla que sostiene todo esto: el precio de Doctovio NO vive en el código.
 * Vive en la tabla `products` y se cambia editando una fila. Buscar un "20"
 * en el código y no encontrarlo es la señal de que está bien hecho.
 *
 * Y la contraparte: al contratar, el precio se COPIA a la suscripción. Subirle
 * el precio al catálogo no le cambia el cobro a quien ya firmó ni altera una
 * sola mensualidad emitida.
 */

export async function listProducts(soloActivos = false) {
  return db.product.findMany({
    where: soloActivos ? { isActive: true } : undefined,
    orderBy: [{ isActive: "desc" }, { code: "asc" }],
    include: { _count: { select: { subscriptions: true } } },
  });
}

export async function getProductByCode(code: string) {
  return db.product.findUnique({ where: { code } });
}

export async function createProduct(data: {
  code: string;
  name: string;
  description?: string;
  price: number;
  currency?: string;
  billingFrequency?: BillingFrequency;
}) {
  const code = data.code.trim().toUpperCase().replace(/\s+/g, "_");
  if (!code) throw new Error("El código del producto es obligatorio.");
  if (!(data.price >= 0)) throw new Error("El precio no puede ser negativo.");

  const existe = await db.product.findUnique({ where: { code } });
  if (existe) throw new Error(`Ya existe un producto con el código ${code}.`);

  return db.product.create({
    data: {
      code,
      name: data.name.trim(),
      description: data.description?.trim() || null,
      price: data.price,
      currency: (data.currency ?? "USD").toUpperCase(),
      billingFrequency: data.billingFrequency ?? "MONTHLY",
    },
  });
}

/**
 * Edita un producto del catálogo.
 *
 * Cambiar el precio aquí afecta SOLO a las contrataciones futuras. Las
 * suscripciones vigentes conservan el suyo y las mensualidades ya emitidas no
 * se tocan: cambiar la lista de precios no puede reescribir el pasado.
 *
 * El `code` no se edita: es la referencia estable del producto.
 */
export async function updateProduct(
  id: string,
  data: { name?: string; description?: string | null; price?: number; currency?: string; billingFrequency?: BillingFrequency; isActive?: boolean }
) {
  if (data.price !== undefined && !(data.price >= 0)) {
    throw new Error("El precio no puede ser negativo.");
  }

  return db.product.update({
    where: { id },
    data: {
      name: data.name?.trim(),
      description: data.description === undefined ? undefined : data.description?.trim() || null,
      price: data.price,
      currency: data.currency?.toUpperCase(),
      billingFrequency: data.billingFrequency,
      isActive: data.isActive,
    },
  });
}

// ---------------------------------------------------------------------------

/** Suscripción vigente de un consultorio, si la tiene. */
export async function activeSubscription(organizationId: string) {
  return db.subscription.findFirst({
    where: { organizationId, status: "ACTIVE" },
    include: { product: true },
    orderBy: { startedAt: "desc" },
  });
}

/**
 * Contrata un producto para un consultorio.
 *
 * El precio se toma del catálogo salvo que se indique otro (descuento
 * negociado). Sea cual sea, queda congelado en la suscripción.
 *
 * Cancela la suscripción anterior en la misma transacción: un consultorio con
 * dos suscripciones activas se cobraría dos veces.
 */
export async function subscribeClinic(params: {
  organizationId: string;
  productId: string;
  /** Precio pactado. Sin él se usa el del catálogo. */
  price?: number;
  startedAt?: Date;
}) {
  const product = await db.product.findUniqueOrThrow({ where: { id: params.productId } });
  const price = params.price ?? product.price;
  if (!(price >= 0)) throw new Error("El precio no puede ser negativo.");

  return db.$transaction(async (tx) => {
    await tx.subscription.updateMany({
      where: { organizationId: params.organizationId, status: "ACTIVE" },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });

    return tx.subscription.create({
      data: {
        organizationId: params.organizationId,
        productId: product.id,
        price,
        currency: product.currency,
        billingFrequency: product.billingFrequency,
        status: "ACTIVE",
        startedAt: params.startedAt ?? new Date(),
      },
      include: { product: true },
    });
  });
}

/**
 * Cancela la suscripción.
 *
 * NO borra las mensualidades ya emitidas: lo que se debe se sigue debiendo, y
 * el historial comercial se conserva completo.
 */
export async function cancelSubscription(organizationId: string) {
  return db.subscription.updateMany({
    where: { organizationId, status: "ACTIVE" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
}
