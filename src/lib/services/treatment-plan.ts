import { db } from "@/lib/db";
import { logAudit } from "@/lib/services/audit";
import { assertPatientInClinic, assertConsultationInClinic } from "@/lib/services/tenant-guard";
import { addOdontogramEntry } from "@/lib/services/odontogram";
import { isValidTooth, isWholeToothCode, findCode } from "@/lib/constants/odontograma";
import { lineTotal, round2 } from "@/lib/utils/money";
import type { ToothSurface, TreatmentStatus } from "@prisma/client";

/**
 * PLAN DE TRATAMIENTO: lo que se le propone al paciente.
 *
 * Es la capa de en medio de las tres, y la única que mezcla lo clínico con lo
 * comercial —pieza y diagnóstico junto a producto y precio— porque en la
 * práctica el dentista las dice en la misma frase.
 *
 * LA REGLA QUE NO SE DOBLA: aceptar ≠ realizar. Que el paciente diga que sí (o
 * que acepte una cotización) mueve el renglón a ACCEPTED y nada más. Pasarlo a
 * COMPLETED es un acto clínico: alguien con permiso tuvo que hacer el
 * tratamiento, y ahí es cuando nace la anotación en el odontograma.
 */

export type PlanItemInput = {
  organizationId: string;
  patientId: string;
  userId: string;
  /** Pieza FDI. Nula para lo que no es de una pieza: limpieza, blanqueamiento. */
  toothCode?: string;
  surfaces?: ToothSurface[];
  diagnosis?: string;
  /** Código del catálogo del odontograma: RESINA, EXTRACCION… */
  treatmentCode: string;
  catalogItemId?: string;
  /** Precio a cobrarle a ESTE paciente. Si no viene, el de lista. */
  unitPrice?: number;
  quantity?: number;
  discount?: number;
  notes?: string;
  findingEntryId?: string;
  consultationId?: string;
  /** Moneda cuando no hay producto de catálogo. La del consultorio, normalmente. */
  currency?: string;
  /** ¿Puede cobrar distinto al catálogo? Lo decide el rol, en la acción. */
  canOverridePrice?: boolean;
};

export async function addTreatmentPlanItem(input: PlanItemInput) {
  const { organizationId, patientId, userId } = input;

  // El patientId llega del formulario. Sin esto se podría meter un tratamiento
  // —y su precio— en el expediente de un paciente de otro consultorio.
  await assertPatientInClinic(organizationId, patientId);

  if (input.consultationId) {
    await assertConsultationInClinic(organizationId, input.consultationId, patientId);
  }

  if (input.toothCode && !isValidTooth(input.toothCode)) {
    throw new Error(`"${input.toothCode}" no es una pieza válida en notación FDI.`);
  }
  if (!findCode(input.treatmentCode)) {
    throw new Error(`"${input.treatmentCode}" no está en el catálogo del odontograma.`);
  }

  // El hallazgo que lo motivó también viene del formulario.
  if (input.findingEntryId) {
    const hallazgo = await db.odontogramEntry.findFirst({
      where: { id: input.findingEntryId, organizationId, patientId },
      select: { id: true },
    });
    if (!hallazgo) throw new Error("El hallazgo no existe en el expediente de este paciente.");
  }

  // --- Precio: se COPIA del catálogo, no se apunta a él ---
  //
  // Se guardan los dos: el de lista y el aplicado. Con uno solo no se puede
  // saber después si hubo descuento o si el catálogo cambió, que son cosas
  // distintas y la segunda no debe parecerse a la primera.
  let itemName = findCode(input.treatmentCode)?.label ?? input.treatmentCode;
  let listPrice: number | null = null;
  let unitPrice = round2(input.unitPrice ?? 0);
  // Sin producto de catálogo, la moneda es la del consultorio. Con producto,
  // manda la del producto: es la que se le dijo al paciente.
  let currency = input.currency ?? "MXN";

  if (input.catalogItemId) {
    const producto = await db.catalogItem.findFirst({
      where: { id: input.catalogItemId, organizationId },
    });
    if (!producto) throw new Error("El producto no existe en el catálogo de este consultorio.");
    if (!producto.isActive) throw new Error(`"${producto.name}" está desactivado en el catálogo.`);

    itemName = producto.name;
    listPrice = producto.price;
    currency = producto.currency;
    unitPrice = input.unitPrice === undefined ? producto.price : round2(input.unitPrice);

    if (unitPrice !== producto.price && !input.canOverridePrice) {
      throw new Error("No tienes permiso para cobrar un precio distinto al del catálogo.");
    }
  }

  if (unitPrice < 0) throw new Error("El precio no puede ser negativo.");

  const item = await db.treatmentPlanItem.create({
    data: {
      organizationId,
      patientId,
      toothCode: input.toothCode || null,
      surfaces: normalizeSurfaces(input.treatmentCode, input.surfaces ?? []),
      diagnosis: input.diagnosis?.trim() || null,
      treatmentCode: input.treatmentCode,
      catalogItemId: input.catalogItemId || null,
      itemName,
      listPrice,
      unitPrice,
      currency,
      quantity: Math.max(1, input.quantity ?? 1),
      discount: round2(Math.max(0, input.discount ?? 0)),
      notes: input.notes?.trim() || null,
      findingEntryId: input.findingEntryId || null,
      consultationId: input.consultationId || null,
      createdById: userId,
    },
  });

  await logAudit({
    organizationId,
    userId,
    action: "CREATE",
    entity: "treatment_plan_item",
    entityId: item.id,
    newValues: {
      diente: item.toothCode,
      tratamiento: item.treatmentCode,
      producto: item.itemName,
      precio: item.unitPrice,
      moneda: item.currency,
    },
  });

  return item;
}

/**
 * Un tratamiento de pieza completa no lleva superficies, y uno de superficie no
 * puede ir sin ellas. Misma regla que en la bitácora del odontograma, para que
 * el renglón del plan y la anotación que produzca digan lo mismo.
 */
function normalizeSurfaces(treatmentCode: string, surfaces: ToothSurface[]): ToothSurface[] {
  if (isWholeToothCode(treatmentCode)) return ["WHOLE"];
  return surfaces.filter((s) => s !== "WHOLE");
}

export async function listTreatmentPlan(organizationId: string, patientId: string) {
  return db.treatmentPlanItem.findMany({
    where: { organizationId, patientId },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    include: {
      catalogItem: { select: { id: true, name: true, price: true, isActive: true } },
      createdBy: { select: { fullName: true } },
      completedBy: { select: { fullName: true } },
      quoteItems: {
        select: { quote: { select: { id: true, folio: true, status: true } } },
        orderBy: { quote: { createdAt: "desc" } },
      },
    },
  });
}

export async function getTreatmentPlanItem(organizationId: string, id: string) {
  return db.treatmentPlanItem.findFirst({
    where: { id, organizationId },
    include: { catalogItem: true },
  });
}

type FilaSumable = {
  unitPrice: number;
  quantity: number;
  discount: number;
  status: TreatmentStatus;
  currency?: string;
};

/**
 * Suma del plan, AGRUPADA POR MONEDA.
 *
 * No se devuelve un solo total porque sumar pesos con dólares da un número que
 * no significa nada. En un consultorio de la frontera, cobrar unos servicios en
 * cada moneda es normal, y un "$4,200" que mezcla las dos es peor que no
 * mostrar nada: parece correcto.
 *
 * Lo cancelado no entra: no se le cobra a nadie.
 */
export function planTotals(items: FilaSumable[]) {
  const vivos = items.filter((i) => i.status !== "CANCELLED");

  const porMoneda = new Map<string, { currency: string; subtotal: number; discount: number; total: number }>();
  for (const i of vivos) {
    const currency = i.currency ?? "MXN";
    const acc = porMoneda.get(currency) ?? { currency, subtotal: 0, discount: 0, total: 0 };
    acc.subtotal = round2(acc.subtotal + round2(i.unitPrice * i.quantity));
    acc.discount = round2(acc.discount + i.discount);
    acc.total = round2(Math.max(0, acc.subtotal - acc.discount));
    porMoneda.set(currency, acc);
  }

  return {
    porMoneda: [...porMoneda.values()],
    pendientes: items.filter((i) => i.status === "PENDING").length,
    aceptados: items.filter((i) => i.status === "ACCEPTED").length,
    realizados: items.filter((i) => i.status === "COMPLETED").length,
  };
}

/**
 * Mueve el estado COMERCIAL del renglón: pendiente, aceptado, en tratamiento,
 * cancelado.
 *
 * COMPLETED no entra por aquí a propósito — tiene su propia función, que exige
 * permiso clínico y deja la anotación en el odontograma. Si se pudiera marcar
 * realizado desde el mismo lugar donde se cambia el estado comercial, tarde o
 * temprano alguien de mostrador daría por hecho un tratamiento que no se hizo.
 */
export async function setTreatmentStatus(
  organizationId: string,
  userId: string,
  id: string,
  status: Exclude<TreatmentStatus, "COMPLETED">
) {
  const actual = await db.treatmentPlanItem.findFirst({
    where: { id, organizationId },
    select: { id: true, status: true, itemName: true, toothCode: true },
  });
  if (!actual) throw new Error("El tratamiento no existe en este consultorio.");

  if (actual.status === "COMPLETED") {
    throw new Error(
      "Este tratamiento ya se realizó. Un tratamiento hecho no se deshace desde el plan: registra la corrección en el odontograma."
    );
  }

  const item = await db.treatmentPlanItem.update({ where: { id }, data: { status } });

  await logAudit({
    organizationId,
    userId,
    action: "UPDATE",
    entity: "treatment_plan_item",
    entityId: id,
    oldValues: { status: actual.status },
    newValues: { status, producto: actual.itemName, diente: actual.toothCode },
  });

  return item;
}

/**
 * MARCA EL TRATAMIENTO COMO REALIZADO.
 *
 * Es el único punto donde el plan escribe en la bitácora clínica: crea la
 * anotación del odontograma (kind=TREATMENT, COMPLETED) y la deja ligada al
 * renglón. Por eso el diagrama se sigue derivando de una sola fuente y el plan
 * no se convierte en una segunda versión del expediente.
 *
 * Los tratamientos sin pieza —una limpieza general, un blanqueamiento— no
 * generan anotación: no hay diente que pintar. Igual quedan como realizados en
 * el plan y en la bitácora de auditoría.
 */
export async function completeTreatment(params: {
  organizationId: string;
  userId: string;
  id: string;
  /** Cuándo se hizo, si no fue hoy. */
  performedAt?: Date;
  notes?: string;
  consultationId?: string;
}) {
  const { organizationId, userId, id } = params;

  const item = await db.treatmentPlanItem.findFirst({ where: { id, organizationId } });
  if (!item) throw new Error("El tratamiento no existe en este consultorio.");
  if (item.status === "COMPLETED") throw new Error("Este tratamiento ya estaba marcado como realizado.");
  if (item.status === "CANCELLED") throw new Error("Este tratamiento está cancelado. Reactívalo antes de marcarlo realizado.");

  let entryId: string | null = null;

  if (item.toothCode) {
    const entry = await addOdontogramEntry({
      organizationId,
      patientId: item.patientId,
      doctorId: userId,
      toothCode: item.toothCode,
      surfaces: item.surfaces,
      kind: "TREATMENT",
      code: item.treatmentCode,
      status: "COMPLETED",
      notes: params.notes?.trim() || item.notes || undefined,
      consultationId: params.consultationId ?? item.consultationId ?? undefined,
      recordedAt: params.performedAt,
    });
    entryId = entry.id;
  }

  const actualizado = await db.treatmentPlanItem.update({
    where: { id },
    data: {
      status: "COMPLETED",
      completedById: userId,
      completedAt: params.performedAt ?? new Date(),
      resultEntryId: entryId,
      ...(params.consultationId ? { consultationId: params.consultationId } : {}),
    },
  });

  await logAudit({
    organizationId,
    userId,
    action: "UPDATE",
    entity: "treatment_plan_item",
    entityId: id,
    oldValues: { status: item.status },
    newValues: {
      status: "COMPLETED",
      diente: item.toothCode,
      tratamiento: item.treatmentCode,
      anotacion: entryId,
    },
  });

  return actualizado;
}

/**
 * Los renglones que todavía se le pueden cotizar al paciente.
 *
 * Lo cancelado y lo ya realizado no: cotizar algo que ya se hizo es la forma
 * más fácil de cobrarlo dos veces.
 */
export async function listQuotablePlanItems(organizationId: string, patientId: string) {
  return db.treatmentPlanItem.findMany({
    where: {
      organizationId,
      patientId,
      status: { in: ["PENDING", "ACCEPTED", "IN_PROGRESS"] },
    },
    orderBy: { createdAt: "asc" },
    include: { catalogItem: { select: { name: true, description: true, taxRate: true } } },
  });
}

/** Renglón por renglón, cuánto se le cobraría. */
export function itemTotal(item: { unitPrice: number; quantity: number; discount: number }): number {
  return lineTotal(item.unitPrice, item.quantity, item.discount);
}
