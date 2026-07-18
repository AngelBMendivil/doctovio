import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getIncomeReport } from "@/lib/services/reports";
import type { PaymentOrigin } from "@prisma/client";

/** Escapa un valor para CSV (comillas, comas y saltos de línea). */
function cell(value: string | number): string {
  const s = String(value);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return new NextResponse("No autenticado", { status: 401 });
  if (session.role !== "ADMIN") return new NextResponse("Sin permiso", { status: 403 });

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const fromStr = searchParams.get("from") || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const toStr = searchParams.get("to") || now.toISOString().slice(0, 10);
  const originRaw = searchParams.get("origin");
  const origin = originRaw === "PRIVATE" || originRaw === "INSURANCE" ? (originRaw as PaymentOrigin) : undefined;

  const { rows } = await getIncomeReport(session.organizationId, {
    from: new Date(`${fromStr}T00:00:00`),
    to: new Date(`${toStr}T23:59:59`),
    origin,
  });

  const header = ["ID paciente", "Nombre", "Fecha", "Medico", "Importe", "Moneda", "Origen", "Aseguradora"];
  const lines = rows.map((r) =>
    [
      cell(r.recordNumber),
      cell(r.patientName),
      cell(r.date.toISOString().slice(0, 10)),
      cell(r.doctorName),
      cell(r.amount.toFixed(2)),
      cell(r.currency),
      cell(r.origin === "INSURANCE" ? "Aseguranza" : "Privado"),
      cell(r.insurerName ?? ""),
    ].join(",")
  );

  // BOM para que Excel abra los acentos correctamente.
  const csv = "﻿" + [header.join(","), ...lines].join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="finanzas-${fromStr}-a-${toStr}.csv"`,
    },
  });
}
