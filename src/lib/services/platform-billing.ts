import { db } from "@/lib/db";
import type { BillingCycleStatus, PaymentMethod, Prisma } from "@prisma/client";

/**
 * COBRANZA DE CONSULTORIOS: mensualidades y pagos.
 *
 * No confundir con `billing.ts`, que es el cobro del PACIENTE al consultorio
 * por su consulta. Esto es lo que el consultorio le paga a Doctovio.
 */

/** Estado que se MUESTRA, con "vencido" incluido. */
export type CycleView = "PAID" | "PARTIAL" | "WAIVED" | "OVERDUE" | "PENDING";

const DAY_MS = 86_400_000;

/** Medianoche local. Comparar a nivel día: la hora no vence a nadie. */
function atMidnight(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Estado visible de una mensualidad.
 *
 * "Vencido" se DERIVA de la fecha, no se guarda. Guardarlo obligaría a un
 * proceso nocturno que recorriera la tabla cambiando filas; el día que ese
 * proceso fallara, el panel mostraría al corriente a alguien vencido y nadie
 * se enteraría. Derivado no puede quedar desincronizado.
 */
export function cycleState(
  cycle: { status: BillingCycleStatus; dueDate: Date },
  now = new Date()
): { view: CycleView; daysOverdue: number } {
  if (cycle.status === "PAID") return { view: "PAID", daysOverdue: 0 };
  if (cycle.status === "WAIVED") return { view: "WAIVED", daysOverdue: 0 };

  const dias = Math.round((atMidnight(now).getTime() - atMidnight(cycle.dueDate).getTime()) / DAY_MS);

  // El día del vencimiento todavía no está vencido: se debe hasta el cierre.
  if (dias > 0) return { view: "OVERDUE", daysOverdue: dias };

  return { view: cycle.status === "PARTIAL" ? "PARTIAL" : "PENDING", daysOverdue: 0 };
}

/** "2026-09" a partir de una fecha. */
export function periodOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Primer día del periodo. Es la fecha de vencimiento del mes. */
export function periodDueDate(period: string): Date {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) throw new Error(`Periodo inválido: ${period}. Se espera "2026-09".`);
  return new Date(y, m - 1, 1, 12, 0, 0); // mediodía: el desfase de zona no mueve el día
}

/**
 * Genera las mensualidades del periodo para las suscripciones activas.
 *
 * IDEMPOTENTE: el único `(subscriptionId, period)` impide duplicar el cobro si
 * se corre dos veces el mismo mes. Se usa `skipDuplicates` en vez de consultar
 * antes, para que dos ejecuciones simultáneas tampoco dupliquen.
 *
 * El importe se copia de la suscripción, que a su vez lo congeló del catálogo.
 * Emitida la mensualidad, ya nada la mueve.
 */
export async function generateBillingCycles(period?: string): Promise<{ period: string; created: number }> {
  const p = period ?? periodOf(new Date());
  const dueDate = periodDueDate(p);

  const subs = await db.subscription.findMany({
    where: {
      status: "ACTIVE",
      // A un consultorio cancelado no se le sigue generando cobro.
      organization: { status: { in: ["TRIAL", "ACTIVE", "SUSPENDED"] } },
    },
    select: { id: true, organizationId: true, price: true, currency: true },
  });

  if (subs.length === 0) return { period: p, created: 0 };

  const r = await db.billingCycle.createMany({
    data: subs.map((s) => ({
      organizationId: s.organizationId,
      subscriptionId: s.id,
      period: p,
      amount: s.price,
      currency: s.currency,
      dueDate,
    })),
    skipDuplicates: true,
  });

  return { period: p, created: r.count };
}

/**
 * Registra un pago contra una mensualidad.
 *
 * Acumula sobre `paidAmount` en vez de sobrescribir: permite pagos parciales y
 * abonos. Solo se marca PAID cuando lo acumulado alcanza el importe; mientras
 * tanto queda PARTIAL, que es información real para cobranza.
 */
export async function registerCyclePayment(params: {
  billingCycleId: string;
  amount: number;
  paidAt: Date;
  method?: PaymentMethod;
  reference?: string;
  notes?: string;
  registeredById: string;
}) {
  if (!(params.amount > 0)) throw new Error("El monto debe ser mayor que cero.");

  return db.$transaction(async (tx) => {
    const cycle = await tx.billingCycle.findUniqueOrThrow({ where: { id: params.billingCycleId } });

    const payment = await tx.clinicPayment.create({
      data: {
        organizationId: cycle.organizationId,
        billingCycleId: cycle.id,
        amount: params.amount,
        currency: cycle.currency,
        periodStart: cycle.dueDate,
        periodEnd: cycle.dueDate,
        paidAt: params.paidAt,
        method: params.method ?? "TRANSFER",
        reference: params.reference,
        notes: params.notes,
        registeredById: params.registeredById,
      },
    });

    const acumulado = cycle.paidAmount + params.amount;
    // Margen de un centavo: con flotantes, 19.999999 debe contar como pagado.
    const cubierto = acumulado >= cycle.amount - 0.01;

    await tx.billingCycle.update({
      where: { id: cycle.id },
      data: {
        paidAmount: acumulado,
        status: cubierto ? "PAID" : "PARTIAL",
        paidAt: cubierto ? params.paidAt : null,
      },
    });

    return payment;
  });
}

/**
 * Condona una mensualidad. No se borra: queda con su importe y marcada como
 * condonada, para que el historial siga cuadrando.
 */
export async function waiveCycle(billingCycleId: string, notes?: string) {
  return db.billingCycle.update({
    where: { id: billingCycleId },
    data: { status: "WAIVED", notes },
  });
}

// ---------------------------------------------------------------------------

export type CarteraFilter = {
  period?: string;
  organizationId?: string;
  /** "PAID" | "PENDING" | "OVERDUE" | "PARTIAL" | "WAIVED" */
  view?: CycleView;
};

/** Mensualidades con su estado visible ya resuelto. */
export async function listCartera(filter: CarteraFilter = {}) {
  const where: Prisma.BillingCycleWhereInput = {
    period: filter.period,
    organizationId: filter.organizationId,
  };

  const cycles = await db.billingCycle.findMany({
    where,
    orderBy: [{ dueDate: "desc" }, { organizationId: "asc" }],
    take: 500,
    include: {
      organization: { select: { id: true, name: true, status: true } },
      subscription: { select: { product: { select: { name: true, code: true } } } },
    },
  });

  const rows = cycles.map((c) => {
    const s = cycleState(c);
    return {
      id: c.id,
      organizationId: c.organizationId,
      clinic: c.organization.name,
      clinicStatus: c.organization.status,
      product: c.subscription.product.name,
      period: c.period,
      amount: c.amount,
      currency: c.currency,
      paidAmount: c.paidAmount,
      dueDate: c.dueDate,
      paidAt: c.paidAt,
      view: s.view,
      daysOverdue: s.daysOverdue,
    };
  });

  // El filtro por estado se aplica DESPUÉS: "vencido" se deriva y no existe
  // como valor en la base, así que no se puede filtrar en el where.
  return filter.view ? rows.filter((r) => r.view === filter.view) : rows;
}

/** KPIs de cartera. Sin periodo, toma el mes en curso. */
export async function carteraSummary(period?: string) {
  const p = period ?? periodOf(new Date());
  const rows = await listCartera({ period: p });

  const suma = (f: (r: (typeof rows)[number]) => boolean) =>
    rows.filter(f).reduce((s, r) => s + r.amount, 0);

  const esperado = rows.filter((r) => r.view !== "WAIVED").reduce((s, r) => s + r.amount, 0);
  const cobrado = rows.reduce((s, r) => s + r.paidAmount, 0);

  return {
    period: p,
    esperado,
    cobrado,
    pendiente: suma((r) => r.view === "PENDING"),
    vencido: suma((r) => r.view === "OVERDUE"),
    condonado: suma((r) => r.view === "WAIVED"),
    // Sin nada esperado la cobranza es 100%, no una división entre cero.
    porcentajeCobranza: esperado > 0 ? Math.round((cobrado / esperado) * 100) : 100,
    totalCiclos: rows.length,
    pagados: rows.filter((r) => r.view === "PAID").length,
    vencidos: rows.filter((r) => r.view === "OVERDUE").length,
  };
}

/** Cartera vencida COMPLETA, de todos los periodos, no solo del mes. */
export async function carteraVencida() {
  const cycles = await db.billingCycle.findMany({
    where: { status: { in: ["PENDING", "PARTIAL"] }, dueDate: { lt: new Date() } },
    orderBy: { dueDate: "asc" },
    include: { organization: { select: { id: true, name: true, status: true } } },
  });

  const rows = cycles.map((c) => ({
    ...cycleState(c),
    id: c.id,
    organizationId: c.organizationId,
    clinic: c.organization.name,
    period: c.period,
    amount: c.amount,
    paidAmount: c.paidAmount,
    saldo: c.amount - c.paidAmount,
    dueDate: c.dueDate,
  }));

  return { rows, total: rows.reduce((s, r) => s + r.saldo, 0) };
}

/**
 * Serie de los últimos N meses para las gráficas del panel.
 *
 * Una sola consulta a mensualidades y otra a consultorios, agrupadas en
 * memoria. Con 40 consultorios son unos cientos de filas: no vale la pena una
 * agregación en SQL que sea más difícil de leer que de ejecutar.
 */
export async function monthlySeries(months = 6) {
  const hoy = new Date();

  const periods: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    periods.push(periodOf(new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)));
  }

  const [cycles, orgs] = await Promise.all([
    db.billingCycle.findMany({
      where: { period: { in: periods } },
      select: { period: true, amount: true, paidAmount: true, status: true },
    }),
    db.organization.findMany({ select: { createdAt: true, status: true } }),
  ]);

  return periods.map((p) => {
    const delMes = cycles.filter((c) => c.period === p);
    const [y, m] = p.split("-").map(Number);

    return {
      period: p,
      // "sep" en vez de "2026-09": la gráfica se lee de un vistazo.
      label: new Date(y, m - 1, 1).toLocaleDateString("es-MX", { month: "short" }),
      esperado: delMes.filter((c) => c.status !== "WAIVED").reduce((s, c) => s + c.amount, 0),
      cobrado: delMes.reduce((s, c) => s + c.paidAmount, 0),
      altas: orgs.filter((o) => periodOf(o.createdAt) === p).length,
      // Consultorios que ya existían al cierre de ese mes.
      acumulado: orgs.filter((o) => periodOf(o.createdAt) <= p).length,
    };
  });
}

/** MRR: lo que factura al mes el conjunto de suscripciones vigentes. */
export async function mrr() {
  const subs = await db.subscription.findMany({
    where: { status: "ACTIVE", organization: { status: { in: ["TRIAL", "ACTIVE"] } } },
    select: { price: true, currency: true, billingFrequency: true },
  });

  return subs.reduce((s, x) => s + (x.billingFrequency === "YEARLY" ? x.price / 12 : x.price), 0);
}
