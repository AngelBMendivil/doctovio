import { db } from "@/lib/db";
import type { PaymentOrigin } from "@prisma/client";

export type IncomeReportRow = {
  paymentId: string;
  recordNumber: string;
  patientName: string;
  date: Date;
  amount: number;
  currency: string;
  origin: PaymentOrigin;
  insurerName: string | null;
  doctorName: string;
};

export type IncomeReport = {
  rows: IncomeReportRow[];
  totals: {
    count: number;
    byCurrency: { currency: string; amount: number }[];
    privateCount: number;
    insuranceCount: number;
  };
};

/**
 * Reporte de pacientes atendidos y cobrados en un rango de fechas.
 * Solo incluye consultas con pago registrado (el ciclo cerrado).
 */
export async function getIncomeReport(
  organizationId: string,
  params: { from: Date; to: Date; origin?: PaymentOrigin }
): Promise<IncomeReport> {
  const payments = await db.payment.findMany({
    where: {
      organizationId,
      createdAt: { gte: params.from, lte: params.to },
      origin: params.origin,
    },
    include: {
      patient: { select: { recordNumber: true, firstName: true, lastLastName: true, secondLastName: true } },
      consultation: { select: { doctor: { select: { fullName: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows: IncomeReportRow[] = payments.map((p) => ({
    paymentId: p.id,
    recordNumber: p.patient.recordNumber,
    patientName: `${p.patient.firstName} ${p.patient.lastLastName} ${p.patient.secondLastName ?? ""}`.trim(),
    date: p.createdAt,
    amount: p.amount,
    currency: p.currency,
    origin: p.origin,
    insurerName: p.insurerName,
    doctorName: p.consultation?.doctor.fullName ?? "",
  }));

  // Los totales se agrupan por moneda: sumar MXN con USD sería incorrecto.
  const byCurrencyMap = new Map<string, number>();
  for (const r of rows) {
    byCurrencyMap.set(r.currency, (byCurrencyMap.get(r.currency) ?? 0) + r.amount);
  }

  return {
    rows,
    totals: {
      count: rows.length,
      byCurrency: [...byCurrencyMap.entries()]
        .map(([currency, amount]) => ({ currency, amount }))
        .sort((a, b) => a.currency.localeCompare(b.currency)),
      privateCount: rows.filter((r) => r.origin === "PRIVATE").length,
      insuranceCount: rows.filter((r) => r.origin === "INSURANCE").length,
    },
  };
}
