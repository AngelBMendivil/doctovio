import { db } from "@/lib/db";
import { logAudit } from "@/lib/services/audit";
import { assertPatientInClinic, assertConsultationInClinic } from "@/lib/services/tenant-guard";
import { isValidTooth, isWholeToothCode, findCode } from "@/lib/constants/odontograma";
import type { OdontogramEntryKind, OdontogramEntryStatus, ToothSurface } from "@prisma/client";

/**
 * ODONTOGRAMA.
 *
 * Es una BITÁCORA: cada hallazgo y cada tratamiento queda como una fila con su
 * fecha, y el diagrama que ve el dentista se deriva de ellas. Nada se
 * sobrescribe, así que la historia de cada pieza sale sola.
 *
 * Todo lo que escribe pasa por `assertPatientInClinic`: los ids llegan del
 * formulario y esto es historia clínica de un paciente.
 */

export type ToothState = {
  toothCode: string;
  /** Lo último registrado por superficie, para pintar el diagrama. */
  surfaces: Partial<Record<ToothSurface, { code: string; kind: OdontogramEntryKind; color: string }>>;
  /** Lo que aplica a la pieza entera: ausente, corona, endodoncia. */
  whole: { code: string; kind: OdontogramEntryKind; color: string }[];
  /** Cuántas anotaciones tiene en total, para saber si vale abrir su historia. */
  total: number;
  /** Tratamientos pendientes: es lo que el dentista busca de un vistazo. */
  pendientes: number;
};

/**
 * Odontograma completo de un paciente: las anotaciones y el estado derivado.
 *
 * El estado se calcula aquí y no se guarda. Guardarlo obligaría a mantener dos
 * verdades sincronizadas, y la que se desincroniza siempre es la copia.
 */
export async function getOdontogram(organizationId: string, patientId: string) {
  const entries = await db.odontogramEntry.findMany({
    where: { organizationId, patientId },
    orderBy: { recordedAt: "asc" },
    include: { doctor: { select: { fullName: true } } },
  });

  const porDiente = new Map<string, ToothState>();

  for (const e of entries) {
    // Lo cancelado no pinta el diagrama, pero SÍ se conserva en la historia:
    // que se haya planeado una extracción y luego se cancelara es información.
    if (e.status === "CANCELLED") {
      const t = porDiente.get(e.toothCode) ?? nuevoEstado(e.toothCode);
      t.total++;
      porDiente.set(e.toothCode, t);
      continue;
    }

    const t = porDiente.get(e.toothCode) ?? nuevoEstado(e.toothCode);
    t.total++;
    if (e.status === "PLANNED" || e.status === "IN_PROGRESS") t.pendientes++;

    const color = findCode(e.code)?.color ?? "#6B7280";
    const marca = { code: e.code, kind: e.kind, color };

    if (e.surfaces.includes("WHOLE") || e.surfaces.length === 0) {
      t.whole.push(marca);
    } else {
      // Las entradas vienen ordenadas por fecha, así que la última gana: un
      // tratamiento posterior tapa al hallazgo que lo motivó, que es justo
      // como se lee un odontograma en papel.
      for (const s of e.surfaces) t.surfaces[s] = marca;
    }

    porDiente.set(e.toothCode, t);
  }

  return { entries, estados: porDiente };
}

function nuevoEstado(toothCode: string): ToothState {
  return { toothCode, surfaces: {}, whole: [], total: 0, pendientes: 0 };
}

/** Historia clínica de UNA pieza, de lo más viejo a lo más nuevo. */
export async function getToothHistory(organizationId: string, patientId: string, toothCode: string) {
  return db.odontogramEntry.findMany({
    where: { organizationId, patientId, toothCode },
    orderBy: { recordedAt: "desc" },
    include: {
      doctor: { select: { fullName: true } },
      consultation: { select: { id: true, startTime: true } },
    },
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
 * historia: es un expediente clínico, y borrar el rastro de lo que se creyó en
 * su momento es peor que dejarlo marcado como error.
 */
export async function setEntryStatus(
  organizationId: string,
  userId: string,
  entryId: string,
  status: OdontogramEntryStatus
) {
  const actual = await db.odontogramEntry.findFirst({
    where: { id: entryId, organizationId },
    select: { id: true, status: true, toothCode: true, patientId: true },
  });
  if (!actual) throw new Error("La anotación no existe en este consultorio.");

  const entry = await db.odontogramEntry.update({
    where: { id: entryId },
    data: { status },
  });

  await logAudit({
    organizationId,
    userId,
    action: "UPDATE",
    entity: "odontogram_entry",
    entityId: entryId,
    oldValues: { status: actual.status },
    newValues: { status, diente: actual.toothCode },
  });

  return entry;
}

/** Resumen para la cabecera: qué tanto hay anotado y qué falta por hacer. */
export async function getOdontogramSummary(organizationId: string, patientId: string) {
  const entries = await db.odontogramEntry.findMany({
    where: { organizationId, patientId, status: { not: "CANCELLED" } },
    select: { toothCode: true, kind: true, status: true },
  });

  return {
    total: entries.length,
    piezasAnotadas: new Set(entries.map((e) => e.toothCode)).size,
    hallazgos: entries.filter((e) => e.kind === "FINDING").length,
    tratamientos: entries.filter((e) => e.kind === "TREATMENT").length,
    pendientes: entries.filter((e) => e.status === "PLANNED" || e.status === "IN_PROGRESS").length,
  };
}
