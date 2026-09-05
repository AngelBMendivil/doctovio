import { db } from "@/lib/db";
import { logAudit } from "@/lib/services/audit";
import { assertPatientInClinic } from "@/lib/services/tenant-guard";
import { generateFolio } from "@/lib/utils/folio";
import { lineTotal, round2 } from "@/lib/utils/money";
import type { QuoteStatus } from "@prisma/client";

/**
 * COTIZACIONES.
 *
 * UNA COTIZACIÓN NO ES UN COBRO. No crea `Payment`, no agenda, no toca el
 * expediente ni cambia datos del paciente. Es un documento comercial
 * informativo: lo que se le prometió al paciente, por escrito, con fecha.
 *
 * DOS REGLAS QUE SOSTIENEN TODO LO DEMÁS:
 *
 * 1. Los conceptos se CONGELAN. Cada renglón guarda su nombre y su precio en
 *    vez de leerlos del catálogo. Si la resina sube de 850 a 1000, la COT-000145
 *    tiene que seguir diciendo 850 dentro de tres años.
 *
 * 2. Aceptar ≠ realizar. Aceptarla mueve los tratamientos de "pendiente" a
 *    "aceptado" y ahí se detiene. Marcarlos realizados es un acto clínico
 *    aparte, con su propio permiso.
 */

/**
 * Vigencia. Se DERIVA de `validUntil`, no se guarda.
 *
 * Misma decisión que "vencido" en la cobranza de la plataforma: guardarlo
 * obligaría a un proceso nocturno que recorriera la tabla, y el día que fallara
 * el sistema mostraría vigente algo que ya venció. Lo derivado no se
 * desincroniza.
 */
export function isExpired(quote: { validUntil: Date | null; status: QuoteStatus }): boolean {
  if (!quote.validUntil) return false;
  // Una cotización ya decidida no "vence": su historia terminó antes.
  if (["ACCEPTED", "REJECTED", "CANCELLED", "PARTIAL"].includes(quote.status)) return false;
  return quote.validUntil.getTime() < Date.now();
}

/** Etiqueta para pantalla, ya con la vigencia derivada. */
export function quoteStateLabel(quote: { validUntil: Date | null; status: QuoteStatus }): string {
  if (isExpired(quote)) return "Vencida";
  const etiquetas: Record<QuoteStatus, string> = {
    DRAFT: "Borrador",
    SENT: "Enviada",
    ACCEPTED: "Aceptada",
    REJECTED: "Rechazada",
    PARTIAL: "Aceptada en parte",
    CANCELLED: "Cancelada",
  };
  return etiquetas[quote.status];
}

/**
 * Crea la cotización a partir de renglones del plan de tratamiento.
 *
 * El folio se emite DENTRO de la transacción y con el candado del consultorio,
 * igual que los de receta y orden médica: dos cotizaciones simultáneas del
 * mismo consultorio se serializan en vez de chocar con llave duplicada delante
 * de quien la está generando.
 */
export async function createQuoteFromPlan(params: {
  organizationId: string;
  patientId: string;
  userId: string;
  treatmentItemIds: string[];
  /** Días de vigencia. 0 o ausente = sin fecha límite. */
  validDays?: number;
  notes?: string;
  terms?: string;
  /** Descuento adicional sobre el total, negociado al cerrar. */
  extraDiscount?: number;
}) {
  const { organizationId, patientId, userId } = params;

  await assertPatientInClinic(organizationId, patientId);

  if (params.treatmentItemIds.length === 0) {
    throw new Error("Elige al menos un tratamiento para cotizar.");
  }

  // Los ids llegan del formulario: se leen filtrando por consultorio Y por
  // paciente. Sin el segundo filtro se podrían colar en la cotización de un
  // paciente los tratamientos de otro — mismo consultorio, expediente ajeno.
  const items = await db.treatmentPlanItem.findMany({
    where: {
      id: { in: params.treatmentItemIds },
      organizationId,
      patientId,
      status: { in: ["PENDING", "ACCEPTED", "IN_PROGRESS"] },
    },
    include: { catalogItem: { select: { description: true, taxRate: true } } },
  });

  if (items.length !== params.treatmentItemIds.length) {
    throw new Error(
      "Alguno de los tratamientos ya no se puede cotizar: no es de este paciente, o ya se realizó o se canceló."
    );
  }

  // UNA cotización, UNA moneda. Sumar pesos con dólares da un total que no
  // significa nada, y en una hoja impresa con el signo de pesos parecería
  // correcto. Si el paciente lleva tratamientos en las dos, van en dos
  // cotizaciones — que además es como se le cobrarán.
  const monedas = [...new Set(items.map((i) => i.currency))];
  if (monedas.length > 1) {
    throw new Error(
      `Estos tratamientos están en monedas distintas (${monedas.join(" y ")}). Genera una cotización por cada una.`
    );
  }
  const currency = monedas[0] ?? "MXN";

  const renglones = items.map((i) => ({
    treatmentPlanItemId: i.id,
    catalogItemId: i.catalogItemId,
    name: i.itemName,
    description: [i.diagnosis, i.catalogItem?.description].filter(Boolean).join(" · ") || null,
    toothCode: i.toothCode,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    discount: i.discount,
    taxRate: i.catalogItem?.taxRate ?? null,
    total: lineTotal(i.unitPrice, i.quantity, i.discount),
  }));

  const subtotal = round2(renglones.reduce((s, r) => s + round2(r.unitPrice * r.quantity), 0));
  const descuentoRenglones = round2(renglones.reduce((s, r) => s + r.discount, 0));
  const extra = round2(Math.max(0, params.extraDiscount ?? 0));
  const discount = round2(descuentoRenglones + extra);
  const tax = round2(
    renglones.reduce((s, r) => s + (r.taxRate ? round2((r.total * r.taxRate) / 100) : 0), 0)
  );
  const total = round2(Math.max(0, subtotal - discount + tax));

  const validUntil =
    params.validDays && params.validDays > 0
      ? new Date(Date.now() + params.validDays * 24 * 60 * 60 * 1000)
      : null;

  const quote = await db.$transaction(async (tx) => {
    const folio = await generateFolio(tx, organizationId, "COT");

    return tx.quote.create({
      data: {
        organizationId,
        patientId,
        folio,
        status: "DRAFT",
        validUntil,
        subtotal,
        discount,
        tax,
        total,
        currency,
        notes: params.notes?.trim() || null,
        terms: params.terms?.trim() || null,
        createdById: userId,
        items: { create: renglones },
      },
      include: { items: true },
    });
  });

  await logAudit({
    organizationId,
    userId,
    action: "CREATE",
    entity: "quote",
    entityId: quote.id,
    newValues: { folio: quote.folio, total: quote.total, moneda: quote.currency, conceptos: quote.items.length },
  });

  return quote;
}

export async function listPatientQuotes(organizationId: string, patientId: string) {
  return db.quote.findMany({
    where: { organizationId, patientId },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { fullName: true } },
      _count: { select: { items: true } },
    },
  });
}

export async function getQuote(organizationId: string, id: string) {
  return db.quote.findFirst({
    where: { id, organizationId },
    include: {
      items: { include: { treatment: { select: { id: true, status: true } } } },
      patient: true,
      createdBy: { select: { fullName: true } },
      decidedBy: { select: { fullName: true } },
    },
  });
}

/**
 * Cambia el estado COMERCIAL de la cotización.
 *
 * Al ACEPTARLA, los tratamientos que siguen pendientes pasan a "aceptado" —y
 * solo eso. Ninguno se marca como realizado: que el paciente aprobara el
 * presupuesto no significa que ya se sentó en el sillón. Confundir las dos
 * cosas es lo que hace que un expediente diga que se hizo una endodoncia que
 * nadie hizo.
 */
export async function setQuoteStatus(
  organizationId: string,
  userId: string,
  id: string,
  status: QuoteStatus
) {
  const actual = await db.quote.findFirst({
    where: { id, organizationId },
    select: { id: true, status: true, folio: true, patientId: true },
  });
  if (!actual) throw new Error("La cotización no existe en este consultorio.");

  if (actual.status === "CANCELLED") {
    throw new Error("Esta cotización está cancelada. Genera una nueva en lugar de reabrirla.");
  }

  const quote = await db.$transaction(async (tx) => {
    const q = await tx.quote.update({
      where: { id },
      data: {
        status,
        ...(["ACCEPTED", "REJECTED", "PARTIAL"].includes(status)
          ? { decidedById: userId, decidedAt: new Date() }
          : {}),
      },
    });

    if (status === "ACCEPTED") {
      const ligados = await tx.quoteItem.findMany({
        where: { quoteId: id, treatmentPlanItemId: { not: null } },
        select: { treatmentPlanItemId: true },
      });
      const ids = ligados.map((l) => l.treatmentPlanItemId!).filter(Boolean);

      if (ids.length > 0) {
        // Solo los PENDING. Uno que ya estuviera en tratamiento o realizado no
        // debe retroceder porque se firmó un papel.
        await tx.treatmentPlanItem.updateMany({
          where: { id: { in: ids }, organizationId, status: "PENDING" },
          data: { status: "ACCEPTED" },
        });
      }
    }

    return q;
  });

  await logAudit({
    organizationId,
    userId,
    action: "UPDATE",
    entity: "quote",
    entityId: id,
    oldValues: { status: actual.status },
    newValues: { status, folio: actual.folio },
  });

  return quote;
}

/** Resumen para el expediente: cuántas hay y cuánto suman las aceptadas. */
export async function getQuotesSummary(organizationId: string, patientId: string) {
  const quotes = await db.quote.findMany({
    where: { organizationId, patientId },
    select: { status: true, total: true, currency: true, validUntil: true },
  });

  // El monto aceptado se agrupa por moneda, por lo mismo que el plan: un solo
  // número que mezcle pesos y dólares no significa nada.
  const aceptadas = quotes.filter((q) => q.status === "ACCEPTED");
  const porMoneda = new Map<string, number>();
  for (const q of aceptadas) {
    porMoneda.set(q.currency, round2((porMoneda.get(q.currency) ?? 0) + q.total));
  }

  return {
    total: quotes.length,
    aceptadas: aceptadas.length,
    montoAceptado: [...porMoneda.entries()].map(([currency, monto]) => ({ currency, monto })),
    vencidas: quotes.filter((q) => isExpired(q)).length,
  };
}
