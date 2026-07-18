import { db } from "@/lib/db";

/**
 * Métricas del dashboard.
 *
 * Nota importante: las citas se filtran por `startTime` (fecha y hora reales),
 * nunca por `scheduledDate` — ese campo es solo fecha y se guarda como
 * medianoche UTC, lo que desplaza el día en zonas horarias de México.
 */
export async function getDashboardData(organizationId: string) {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    attendedToday,
    waitingNow,
    inConsultation,
    toConfirm,
    pendingPayment,
    newPatientsMonth,
    pendingPreRegs,
    paymentsMonth,
    upcoming,
    recentPayments,
  ] = await Promise.all([
    // Atendidos hoy: consultas finalizadas.
    db.consultation.count({
      where: { organizationId, status: "COMPLETED", finalizedAt: { gte: startOfDay, lte: endOfDay } },
    }),
    db.visit.count({ where: { organizationId, status: { in: ["REGISTERED", "WAITING", "IN_TRIAGE"] } } }),
    db.visit.count({ where: { organizationId, status: "IN_CONSULTATION" } }),
    db.appointment.count({
      where: {
        organizationId,
        startTime: { gte: startOfDay, lte: endOfDay },
        status: "TO_CONFIRM",
        isActive: true,
      },
    }),
    // Por cobrar: consultas cerradas sin pago (cola de dinero pendiente).
    db.consultation.count({ where: { organizationId, status: "COMPLETED", payment: { is: null } } }),
    db.patient.count({
      where: { organizationId, status: { not: "ARCHIVED" }, createdAt: { gte: startOfMonth } },
    }),
    // Prerregistros que el paciente ya envió pero el consultorio no ha convertido.
    db.publicFormToken.count({
      where: { organizationId, type: "PRE_REGISTRATION", status: { in: ["SUBMITTED", "REVIEWED"] } },
    }),
    db.payment.findMany({
      where: { organizationId, createdAt: { gte: startOfMonth } },
      select: { amount: true, currency: true },
    }),
    // Próximas citas: de ahora en adelante, dentro del día.
    db.appointment.findMany({
      where: {
        organizationId,
        startTime: { gte: now, lte: endOfDay },
        isActive: true,
        status: { notIn: ["CANCELLED", "RESCHEDULED", "NO_SHOW"] },
      },
      include: { patient: true, doctor: true },
      orderBy: { startTime: "asc" },
      take: 5,
    }),
    db.payment.findMany({
      where: { organizationId },
      include: { patient: { select: { firstName: true, lastLastName: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  // Ingresos agrupados por moneda: sumar MXN con USD sería incorrecto.
  const incomeByCurrency = new Map<string, number>();
  for (const p of paymentsMonth) {
    incomeByCurrency.set(p.currency, (incomeByCurrency.get(p.currency) ?? 0) + p.amount);
  }

  return {
    attendedToday,
    waitingNow,
    inConsultation,
    toConfirm,
    pendingPayment,
    newPatientsMonth,
    pendingPreRegs,
    incomeMonth: [...incomeByCurrency.entries()].map(([currency, amount]) => ({ currency, amount })),
    upcoming,
    recentPayments,
  };
}
