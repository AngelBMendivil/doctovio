import { db } from "@/lib/db";
import { logAudit } from "@/lib/services/audit";
import { CATEGORIAS_SUGERIDAS } from "@/lib/constants/odontograma";
import { round2 } from "@/lib/utils/money";
import type { CatalogItemType, Prisma } from "@prisma/client";

/**
 * PRODUCTOS Y SERVICIOS DEL CONSULTORIO.
 *
 * OJO con el nombre: `CatalogItem` es lo que el consultorio le cobra a SU
 * paciente. `Product` —la tabla que ya existía— es lo que Doctovio le cobra al
 * consultorio. Son dos catálogos de dos negocios distintos y nunca se mezclan;
 * el panel Master administra el segundo y jamás toca el primero.
 *
 * Cada consultorio administra el suyo: no hay catálogo global compartido.
 * Todas las funciones exigen `organizationId` y filtran por él.
 */

// ---------------------------------------------------------------------------
// Categorías
// ---------------------------------------------------------------------------

/**
 * Siembra las categorías sugeridas la primera vez, y solo la primera.
 *
 * Es idempotente por diseño: si el consultorio ya tiene aunque sea una, no se
 * toca nada. Un consultorio que borró las que no usaba no debe encontrárselas
 * de vuelta cada vez que abre la pantalla.
 */
export async function ensureCategories(organizationId: string) {
  const cuantas = await db.catalogCategory.count({ where: { organizationId } });
  if (cuantas > 0) return;

  await db.catalogCategory.createMany({
    data: CATEGORIAS_SUGERIDAS.map((name) => ({ organizationId, name })),
    skipDuplicates: true,
  });
}

export async function listCategories(organizationId: string, activeOnly = true) {
  return db.catalogCategory.findMany({
    where: { organizationId, ...(activeOnly ? { isActive: true } : {}) },
    orderBy: { name: "asc" },
  });
}

export async function createCategory(organizationId: string, name: string) {
  const limpio = name.trim();
  if (!limpio) throw new Error("La categoría necesita un nombre.");

  const yaExiste = await db.catalogCategory.findFirst({
    where: { organizationId, name: { equals: limpio, mode: "insensitive" } },
  });
  if (yaExiste) return yaExiste;

  return db.catalogCategory.create({ data: { organizationId, name: limpio } });
}

// ---------------------------------------------------------------------------
// Productos y servicios
// ---------------------------------------------------------------------------

export type CatalogFilters = {
  search?: string;
  categoryId?: string;
  type?: CatalogItemType;
  /** "activos" | "inactivos" | "todos". Por defecto, todos. */
  estado?: string;
};

export async function listCatalogItems(organizationId: string, filtros: CatalogFilters = {}) {
  const where: Prisma.CatalogItemWhereInput = { organizationId };

  if (filtros.search?.trim()) {
    const q = filtros.search.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { code: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }
  if (filtros.categoryId) where.categoryId = filtros.categoryId;
  if (filtros.type) where.type = filtros.type;
  if (filtros.estado === "activos") where.isActive = true;
  if (filtros.estado === "inactivos") where.isActive = false;

  return db.catalogItem.findMany({
    where,
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: { category: true },
  });
}

/** Los que se pueden elegir al planear un tratamiento: solo los activos. */
export async function listActiveCatalogItems(organizationId: string) {
  return db.catalogItem.findMany({
    where: { organizationId, isActive: true },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    include: { category: true },
  });
}

export async function getCatalogItem(organizationId: string, id: string) {
  return db.catalogItem.findFirst({
    where: { id, organizationId },
    include: { category: true },
  });
}

export type CatalogItemInput = {
  name: string;
  code?: string;
  type: CatalogItemType;
  categoryId?: string;
  description?: string;
  price: number;
  taxRate?: number;
};

export async function createCatalogItem(
  organizationId: string,
  userId: string,
  data: CatalogItemInput
) {
  await assertCodeLibre(organizationId, data.code);

  const item = await db.catalogItem.create({
    data: {
      organizationId,
      name: data.name.trim(),
      code: data.code?.trim() || null,
      type: data.type,
      categoryId: data.categoryId || null,
      description: data.description?.trim() || null,
      price: round2(data.price),
      taxRate: data.taxRate ?? null,
      createdById: userId,
    },
  });

  await logAudit({
    organizationId,
    userId,
    action: "CREATE",
    entity: "catalog_item",
    entityId: item.id,
    newValues: { name: item.name, code: item.code, price: item.price, type: item.type },
  });

  return item;
}

/**
 * Edita un renglón del catálogo.
 *
 * El cambio de PRECIO se registra aparte en la bitácora, con el valor anterior
 * y el nuevo. Es la pregunta que alguien va a hacer tarde o temprano —"¿por qué
 * esta cotización dice 850 si la resina cuesta 1000?"— y la respuesta tiene que
 * estar escrita en algún lado.
 */
export async function updateCatalogItem(
  organizationId: string,
  userId: string,
  id: string,
  data: CatalogItemInput & { isActive: boolean }
) {
  const actual = await getCatalogItem(organizationId, id);
  if (!actual) throw new Error("El producto no existe en este consultorio.");

  await assertCodeLibre(organizationId, data.code, id);

  const item = await db.catalogItem.update({
    where: { id },
    data: {
      name: data.name.trim(),
      code: data.code?.trim() || null,
      type: data.type,
      categoryId: data.categoryId || null,
      description: data.description?.trim() || null,
      price: round2(data.price),
      taxRate: data.taxRate ?? null,
      isActive: data.isActive,
    },
  });

  await logAudit({
    organizationId,
    userId,
    action: "UPDATE",
    entity: "catalog_item",
    entityId: id,
    oldValues: { name: actual.name, price: actual.price, isActive: actual.isActive },
    newValues: { name: item.name, price: item.price, isActive: item.isActive },
  });

  if (actual.price !== item.price) {
    await logAudit({
      organizationId,
      userId,
      action: "UPDATE",
      entity: "catalog_item_price",
      entityId: id,
      oldValues: { price: actual.price },
      newValues: { price: item.price, producto: item.name },
    });
  }

  return item;
}

/**
 * Activa o desactiva. NO existe borrar.
 *
 * Un producto usado en una cotización o en un tratamiento no se puede eliminar
 * sin dejar huecos en documentos ya entregados al paciente. Y para los que no
 * se han usado tampoco vale la pena la excepción: desactivar los saca de todas
 * las listas, que es lo que la persona quería.
 */
export async function setCatalogItemActive(
  organizationId: string,
  userId: string,
  id: string,
  isActive: boolean
) {
  const actual = await getCatalogItem(organizationId, id);
  if (!actual) throw new Error("El producto no existe en este consultorio.");

  const item = await db.catalogItem.update({ where: { id }, data: { isActive } });

  await logAudit({
    organizationId,
    userId,
    action: "UPDATE",
    entity: "catalog_item",
    entityId: id,
    oldValues: { isActive: actual.isActive },
    newValues: { isActive, nombre: item.name },
  });

  return item;
}

/** Cuántas veces se ha usado. Se muestra en la edición para que se vea por qué
 *  no se puede borrar. */
export async function countCatalogItemUsage(organizationId: string, id: string) {
  const [tratamientos, cotizaciones] = await Promise.all([
    db.treatmentPlanItem.count({ where: { organizationId, catalogItemId: id } }),
    db.quoteItem.count({ where: { catalogItemId: id, quote: { organizationId } } }),
  ]);
  return { tratamientos, cotizaciones, total: tratamientos + cotizaciones };
}

async function assertCodeLibre(organizationId: string, code?: string, exceptId?: string) {
  const limpio = code?.trim();
  if (!limpio) return;

  const otro = await db.catalogItem.findFirst({
    where: { organizationId, code: limpio, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true, name: true },
  });
  if (otro) throw new Error(`El código "${limpio}" ya lo usa "${otro.name}".`);
}
