import { db } from "@/lib/db";
import { logAudit } from "@/lib/services/audit";
import { assertPatientInClinic, assertConsultationInClinic } from "@/lib/services/tenant-guard";
import {
  isValidTooth,
  isWholeToothCode,
  isMissingCode,
  findCode,
  codeLabel,
  type ToothLayer,
} from "@/lib/constants/odontograma";
import type { OdontogramEntryKind, OdontogramEntryStatus, ToothSurface } from "@prisma/client";

/**
 * ODONTOGRAMA.
 *
 * Es una BITÁCORA: cada hallazgo y cada tratamiento realizado queda como una
 * fila con su fecha, y el diagrama que ve el dentista se deriva de ellas. Nada
 * se sobrescribe, así que la historia de cada pieza sale sola.
 *
 * LO PLANEADO NO VIVE AQUÍ. Vive en `treatment_plan_items`, que es donde
 * también está su precio y su estado comercial. El diagrama las junta al
 * pintar; las tablas no se mezclan.
 *
 * Todo lo que escribe pasa por `assertPatientInClinic`: los ids llegan del
 * formulario y esto es historia clínica de un paciente.
 */

export type ToothMark = {
  layer: ToothLayer;
  code: string;
  label: string;
};

export type ToothState = {
  toothCode: string;
  /** Lo que se pinta en cada cara. */
  surfaces: Partial<Record<ToothSurface, ToothMark>>;
  /** Lo que aplica a la pieza entera: corona, endodoncia, implante. */
  whole: ToothMark[];
  /** La pieza no está en la boca: se dibuja tachada y en gris. */
  missing: boolean;
  /** Cuántas anotaciones tiene, para saber si vale abrir su historia. */
  total: number;
  /** Tratamientos del plan todavía por hacer sobre esta pieza. */
  pendientes: number;
};

export type OdontogramView = {
  estados: Map<string, ToothState>;
  /** Fecha de la anotación más antigua: es el "odontograma inicial". */
  primeraFecha: Date | null;
};

/**
 * Estado del odontograma, derivado.
 *
 * `asOf` reconstruye la boca a una fecha: con él se ve el odontograma INICIAL
 * (o el de cualquier día) sin guardar una segunda copia. Esto es lo que compra
 * la bitácora — un diagrama que se sobrescribiera no podría mirar hacia atrás.
 *
 * QUÉ GANA CADA CARA, en este orden:
 *   1. planeado (ámbar)  — hay algo por hacer ahí; es lo accionable
 *   2. realizado (verde) — la última anotación de esa cara fue un tratamiento
 *   3. hallazgo (rojo)   — hay un problema sin plan todavía
 *   y la pieza entera en gris si está ausente, por encima de todo lo demás.
 */
export async function getOdontogram(
  organizationId: string,
  patientId: string,
  opts: { asOf?: Date } = {}
): Promise<OdontogramView & { entries: Awaited<ReturnType<typeof listEntries>> }> {
  const [entries, planeados] = await Promise.all([
    listEntries(organizationId, patientId, opts.asOf),
    // Lo planeado es estado actual, no histórico: al mirar hacia atrás no se
    // pinta, porque en esa fecha todavía no existía como plan.
    opts.asOf
      ? Promise.resolve([])
      : db.treatmentPlanItem.findMany({
          where: {
            organizationId,
            patientId,
            status: { in: ["PENDING", "ACCEPTED", "IN_PROGRESS"] },
            toothCode: { not: null },
          },
          select: { toothCode: true, surfaces: true, treatmentCode: true },
        }),
  ]);

  const porDiente = new Map<string, ToothState>();
  const estado = (code: string) => {
    const t = porDiente.get(code) ?? nuevoEstado(code);
    porDiente.set(code, t);
    return t;
  };

  for (const e of entries) {
    const t = estado(e.toothCode);
    t.total++;

    // Lo cancelado no pinta el diagrama, pero SÍ se conserva en la historia:
    // que se haya planeado una extracción y luego se cancelara es información.
    if (e.status === "CANCELLED") continue;
    // Lo que sigue en PLANNED en la bitácora es de antes de que existiera el
    // plan de tratamiento. Se respeta y se pinta como planeado.
    const layer: ToothLayer =
      e.status === "PLANNED" || e.status === "IN_PROGRESS"
        ? "PLANNED"
        : e.kind === "TREATMENT"
          ? "DONE"
          : "FINDING";

    if (layer === "PLANNED") t.pendientes++;
    if (isMissingCode(e.code)) t.missing = true;

    const marca: ToothMark = { layer, code: e.code, label: codeLabel(e.code) };

    if (e.surfaces.includes("WHOLE") || e.surfaces.length === 0) {
      t.whole.push(marca);
    } else {
      // Vienen ordenadas por fecha, así que la última gana: un tratamiento
      // posterior tapa al hallazgo que lo motivó, que es como se lee un
      // odontograma en papel.
      for (const s of e.surfaces) t.surfaces[s] = marca;
    }
  }

  // Lo planeado se pinta encima: es lo que falta por hacer, y es lo que el
  // dentista busca de un vistazo al abrir el expediente.
  for (const p of planeados) {
    const t = estado(p.toothCode!);
    t.pendientes++;
    const marca: ToothMark = { layer: "PLANNED", code: p.treatmentCode, label: codeLabel(p.treatmentCode) };

    if (p.surfaces.includes("WHOLE") || p.surfaces.length === 0) {
      t.whole.push(marca);
    } else {
      for (const s of p.surfaces) t.surfaces[s] = marca;
    }
  }

  return {
    entries,
    estados: porDiente,
    primeraFecha: entries.length > 0 ? entries[0].recordedAt : null,
  };
}

function listEntries(organizationId: string, patientId: string, asOf?: Date) {
  return db.odontogramEntry.findMany({
    where: { organizationId, patientId, ...(asOf ? { recordedAt: { lte: asOf } } : {}) },
    orderBy: { recordedAt: "asc" },
    include: { doctor: { select: { fullName: true } } },
  });
}

function nuevoEstado(toothCode: string): ToothState {
  return { toothCode, surfaces: {}, whole: [], missing: false, total: 0, pendientes: 0 };
}

/** Historia clínica de UNA pieza, de lo más nuevo a lo más viejo. */
export async function getToothHistory(organizationId: string, patientId: string, toothCode: string) {
  return db.odontogramEntry.findMany({
    where: { organizationId, patientId, toothCode },
    orderBy: { recordedAt: "desc" },
    include: {
      doctor: { select: { fullName: true } },
      consultation: { select: { id: true, startTime: true } },
      planItemResult: { select: { id: true, itemName: true, unitPrice: true } },
    },
  });
}

/** Lo que hay planeado para esa pieza, con su precio. */
export async function getToothPlan(organizationId: string, patientId: string, toothCode: string) {
  return db.treatmentPlanItem.findMany({
    where: { organizationId, patientId, toothCode },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { fullName: true } },
      completedBy: { select: { fullName: true } },
      quoteItems: { select: { quote: { select: { id: true, folio: true, status: true } } } },
    },
  });
}

/** Documentos del expediente ligados a esa pieza: radiografías, fotos. */
export async function getToothDocuments(organizationId: string, patientId: string, toothCode: string) {
  return db.patientDocument.findMany({
    where: { organizationId, patientId, toothCode, status: "ACTIVE" },
    orderBy: { uploadedAt: "desc" },
    select: { id: true, name: true, category: true, uploadedAt: true },
  });
}

/** Anota un hallazgo o un tratamiento sobre una pieza. */
export async function addOdontogramEntry(params: {
  organizationId: string;
  patientId: string;
  doctorId: string;
  toothCode: string;
  surfaces: ToothSurface[];
  kind: OdontogramEntryKind;
  code: string;
  status?: OdontogramEntryStatus;
  notes?: string;
  consultationId?: string;
  recordedAt?: Date;
}) {
  // El patientId viene del formulario: sin esto se podría anotar en el
  // odontograma de un paciente de otro consultorio.
  await assertPatientInClinic(params.organizationId, params.patientId);

  if (params.consultationId) {
    await assertConsultationInClinic(params.organizationId, params.consultationId, params.patientId);
  }

  if (!isValidTooth(params.toothCode)) {
    throw new Error(`"${params.toothCode}" no es una pieza válida en notación FDI.`);
  }
  if (!findCode(params.code)) {
    throw new Error(`"${params.code}" no está en el catálogo del odontograma.`);
  }

  // Lo que aplica a la pieza entera no lleva superficies, y al revés: pedir la
  // superficie de una extracción no significa nada, y una caries sin superficie
  // pierde justo el dato que hace útil el registro.
  const wholeTooth = isWholeToothCode(params.code);
  const surfaces: ToothSurface[] = wholeTooth ? ["WHOLE"] : params.surfaces.filter((s) => s !== "WHOLE");

  if (!wholeTooth && surfaces.length === 0) {
    throw new Error("Elige al menos una superficie: sin ella no se sabe qué cara del diente se trató.");
  }

  const entry = await db.odontogramEntry.create({
    data: {
      organizationId: params.organizationId,
      patientId: params.patientId,
      doctorId: params.doctorId,
      toothCode: params.toothCode,
      surfaces,
      kind: params.kind,
      code: params.code,
      status: params.status ?? "COMPLETED",
      notes: params.notes?.trim() || null,
      consultationId: params.consultationId ?? null,
      recordedAt: params.recordedAt ?? new Date(),
    },
  });

  await logAudit({
    organizationId: params.organizationId,
    userId: params.doctorId,
    action: "CREATE",
    entity: "odontogram_entry",
    entityId: entry.id,
    newValues: { diente: params.toothCode, code: params.code, kind: params.kind },
  });

  return entry;
}

/**
 * Cambia el estado de una anotación: de planeado a terminado, o cancelada.
 *
 * NO existe borrar. Una anotación equivocada se CANCELA y queda visible en la
 * historia, con quién la corrigió y cuándo: es un expediente clínico, y borrar
 * el rastro de lo que se creyó en su momento es peor que dejarlo marcado como
 * error.
 */
export async function setEntryStatus(
  organizationId: string,
  userId: string,
  entryId: string,
  status: OdontogramEntryStatus,
  motivo?: string
) {
  const actual = await db.odontogramEntry.findFirst({
    where: { id: entryId, organizationId },
    select: { id: true, status: true, toothCode: true, patientId: true, notes: true },
  });
  if (!actual) throw new Error("La anotación no existe en este consultorio.");

  const entry = await db.odontogramEntry.update({
    where: { id: entryId },
    data: {
      status,
      // El motivo se ANEXA, no reemplaza la nota original.
      ...(motivo?.trim()
        ? { notes: [actual.notes, `[${new Date().toLocaleDateString("es-MX")}] ${motivo.trim()}`].filter(Boolean).join("\n") }
        : {}),
    },
  });

  await logAudit({
    organizationId,
    userId,
    action: "UPDATE",
    entity: "odontogram_entry",
    entityId: entryId,
    oldValues: { status: actual.status },
    newValues: { status, diente: actual.toothCode, motivo: motivo ?? null },
  });

  return entry;
}

/** Resumen para la cabecera: qué tanto hay anotado y qué falta por hacer. */
export async function getOdontogramSummary(organizationId: string, patientId: string) {
  const [entries, pendientes] = await Promise.all([
    db.odontogramEntry.findMany({
      where: { organizationId, patientId, status: { not: "CANCELLED" } },
      select: { toothCode: true, kind: true, status: true },
    }),
    db.treatmentPlanItem.count({
      where: { organizationId, patientId, status: { in: ["PENDING", "ACCEPTED", "IN_PROGRESS"] } },
    }),
  ]);

  return {
    total: entries.length,
    piezasAnotadas: new Set(entries.map((e) => e.toothCode)).size,
    hallazgos: entries.filter((e) => e.kind === "FINDING").length,
    tratamientos: entries.filter((e) => e.kind === "TREATMENT").length,
    pendientes,
  };
}

/**
 * Eventos dentales para la línea de tiempo del expediente.
 *
 * Se devuelven con la misma forma que usa `getPatientTimeline` para poder
 * mezclarlos con los del core, en vez de abrir una segunda línea de tiempo
 * paralela debajo de la que ya existe.
 */
export async function getDentalTimeline(organizationId: string, patientId: string) {
  const [entries, plan, quotes] = await Promise.all([
    db.odontogramEntry.findMany({
      where: { organizationId, patientId },
      orderBy: { recordedAt: "desc" },
      select: { id: true, recordedAt: true, toothCode: true, code: true, kind: true, status: true },
    }),
    db.treatmentPlanItem.findMany({
      where: { organizationId, patientId },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, toothCode: true, itemName: true, status: true },
    }),
    db.quote.findMany({
      where: { organizationId, patientId },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, folio: true, total: true, status: true, decidedAt: true },
    }),
  ]);

  const eventos: { date: Date; type: string; label: string; refId: string }[] = [];

  for (const e of entries) {
    const pieza = ` — pieza ${e.toothCode}`;
    const que = e.kind === "FINDING" ? codeLabel(e.code) : `${codeLabel(e.code)} realizada`;
    eventos.push({
      date: e.recordedAt,
      type: "dental_entry",
      label: e.status === "CANCELLED" ? `${que} (cancelado)${pieza}` : `${que}${pieza}`,
      refId: e.id,
    });
  }

  for (const p of plan) {
    eventos.push({
      date: p.createdAt,
      type: "dental_plan",
      label: `${p.itemName} planeado${p.toothCode ? ` — pieza ${p.toothCode}` : ""}`,
      refId: p.id,
    });
  }

  for (const q of quotes) {
    eventos.push({
      date: q.createdAt,
      type: "quote",
      label: `Cotización ${q.folio} generada`,
      refId: q.id,
    });
    if (q.decidedAt) {
      const decision =
        q.status === "ACCEPTED" ? "aceptada" : q.status === "REJECTED" ? "rechazada" : "aceptada en parte";
      eventos.push({
        date: q.decidedAt,
        type: "quote",
        label: `Cotización ${q.folio} ${decision}`,
        refId: q.id,
      });
    }
  }

  return eventos;
}
