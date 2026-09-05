"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireSession } from "@/lib/auth/session";
import { assertPermission, hasPermission } from "@/lib/auth/rbac";
import { assertDentalClinic } from "@/lib/services/clinic-features";
import { getClinicCurrency } from "@/lib/services/organizations";
import { addOdontogramEntry, setEntryStatus } from "@/lib/services/odontogram";
import {
  addTreatmentPlanItem,
  setTreatmentStatus,
  completeTreatment,
} from "@/lib/services/treatment-plan";
import { createQuoteFromPlan, setQuoteStatus, getQuote } from "@/lib/services/quotes";
import { sendEmail } from "@/lib/email/resend";
import { templates } from "@/lib/email/templates";
import { logAudit } from "@/lib/services/audit";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/utils/money";
import {
  odontogramEntrySchema,
  cancelEntrySchema,
  planItemSchema,
  treatmentStatusSchema,
  completeTreatmentSchema,
  createQuoteSchema,
  quoteStatusSchema,
  surfaceEnum,
} from "@/lib/validations/dental";
import type { ToothSurface } from "@prisma/client";

/**
 * MÓDULO DENTAL — odontograma, plan de tratamiento y cotizaciones.
 *
 * Cada acción cierra las mismas tres puertas: sesión válida, permiso del rol y
 * consultorio dental. La cuarta —que el paciente sea de este consultorio— la
 * cierran los servicios con `assertPatientInClinic`, porque el `patientId`
 * llega del formulario y quien manda el formulario lo elige.
 */

export type ActionState = { ok: boolean; message: string } | null;

function toState(error: unknown): ActionState {
  if (error instanceof ZodError) {
    return { ok: false, message: error.issues[0]?.message ?? "Revisa los campos." };
  }
  if (error instanceof Error) {
    if (error.message.startsWith("FORBIDDEN")) return { ok: false, message: "No tienes permiso para esta acción." };
    return { ok: false, message: error.message };
  }
  return { ok: false, message: "Ocurrió un error inesperado." };
}

/** Las superficies llegan como varias casillas con el mismo nombre. */
function leerSuperficies(formData: FormData): ToothSurface[] {
  return formData
    .getAll("surfaces")
    .map((v) => surfaceEnum.safeParse(String(v)))
    .filter((r) => r.success)
    .map((r) => (r as { data: ToothSurface }).data);
}

/** Una fecha de formulario (YYYY-MM-DD) sin sorpresas de zona horaria. */
function leerFecha(valor?: string): Date | undefined {
  if (!valor) return undefined;
  const [y, m, d] = valor.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  // Mediodía local: así no se cruza al día anterior en zonas de México, que es
  // el mismo error que ya nos mordió con `scheduledDate`.
  return new Date(y, m - 1, d, 12, 0, 0);
}

// ---------------------------------------------------------------------------
// Odontograma
// ---------------------------------------------------------------------------

/** Registra un hallazgo o un tratamiento ya realizado sobre una pieza. */
export async function addEntryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    assertPermission(session.role, "EDIT_DENTAL_CHART");
    await assertDentalClinic(session.organizationId);

    const data = odontogramEntrySchema.parse(Object.fromEntries(formData.entries()));

    await addOdontogramEntry({
      organizationId: session.organizationId,
      patientId: data.patientId,
      doctorId: session.userId,
      toothCode: data.toothCode,
      surfaces: leerSuperficies(formData),
      kind: data.kind,
      code: data.code,
      status: "COMPLETED",
      notes: data.notes || undefined,
      consultationId: data.consultationId || undefined,
      recordedAt: leerFecha(data.recordedAt || undefined),
    });

    revalidatePath(`/patients/${data.patientId}/odontograma`);
    revalidatePath(`/patients/${data.patientId}`);
    return { ok: true, message: `Registrado en la pieza ${data.toothCode}.` };
  } catch (e) {
    return toState(e);
  }
}

/**
 * Corrige una anotación equivocada: la CANCELA y exige un motivo.
 *
 * No hay borrar. La anotación anterior, la corrección, quién la hizo y por qué
 * quedan las cuatro en el expediente: es lo que se le pide a un registro
 * clínico, y es lo que permite defenderlo después.
 */
export async function cancelEntryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    assertPermission(session.role, "EDIT_DENTAL_CHART");
    await assertDentalClinic(session.organizationId);

    const data = cancelEntrySchema.parse(Object.fromEntries(formData.entries()));
    await setEntryStatus(session.organizationId, session.userId, data.entryId, "CANCELLED", data.motivo);

    revalidatePath(`/patients/${data.patientId}/odontograma`);
    return { ok: true, message: "La anotación quedó marcada como corregida." };
  } catch (e) {
    return toState(e);
  }
}

// ---------------------------------------------------------------------------
// Plan de tratamiento
// ---------------------------------------------------------------------------

export async function addTreatmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    assertPermission(session.role, "EDIT_DENTAL_CHART");
    await assertDentalClinic(session.organizationId);

    const data = planItemSchema.parse(Object.fromEntries(formData.entries()));

    await addTreatmentPlanItem({
      organizationId: session.organizationId,
      patientId: data.patientId,
      userId: session.userId,
      toothCode: data.toothCode || undefined,
      surfaces: leerSuperficies(formData),
      diagnosis: data.diagnosis || undefined,
      treatmentCode: data.treatmentCode,
      catalogItemId: data.catalogItemId || undefined,
      unitPrice: data.unitPrice,
      quantity: data.quantity,
      discount: data.discount,
      notes: data.notes || undefined,
      findingEntryId: data.findingEntryId || undefined,
      consultationId: data.consultationId || undefined,
      // Sin producto de catálogo no hay de dónde sacar la moneda: se usa la del
      // consultorio. Con producto, el servicio toma la suya y esto se ignora.
      currency: await getClinicCurrency(session.organizationId),
      // El precio distinto al de catálogo es una decisión con permiso propio.
      canOverridePrice: hasPermission(session.role, "OVERRIDE_PRICE"),
    });

    revalidatePath(`/patients/${data.patientId}/odontograma`);
    return { ok: true, message: "Tratamiento agregado al plan." };
  } catch (e) {
    return toState(e);
  }
}

/** Mueve el estado comercial del tratamiento. Nunca a "realizado". */
export async function setTreatmentStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    assertPermission(session.role, "MANAGE_QUOTES");
    await assertDentalClinic(session.organizationId);

    const data = treatmentStatusSchema.parse(Object.fromEntries(formData.entries()));
    await setTreatmentStatus(session.organizationId, session.userId, data.id, data.status);

    revalidatePath(`/patients/${data.patientId}/odontograma`);
    return { ok: true, message: "Estado del tratamiento actualizado." };
  } catch (e) {
    return toState(e);
  }
}

/**
 * Marca el tratamiento como REALIZADO y lo escribe en el odontograma.
 *
 * Exige permiso clínico, no comercial: aceptar una cotización no hace un
 * tratamiento, y quien cobra no es necesariamente quien atiende.
 */
export async function completeTreatmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    assertPermission(session.role, "MANAGE_DENTAL_TREATMENT");
    await assertDentalClinic(session.organizationId);

    const data = completeTreatmentSchema.parse(Object.fromEntries(formData.entries()));
    await completeTreatment({
      organizationId: session.organizationId,
      userId: session.userId,
      id: data.id,
      performedAt: leerFecha(data.performedAt || undefined),
      notes: data.notes || undefined,
      consultationId: data.consultationId || undefined,
    });

    revalidatePath(`/patients/${data.patientId}/odontograma`);
    revalidatePath(`/patients/${data.patientId}`);
    return { ok: true, message: "Tratamiento registrado como realizado en el odontograma." };
  } catch (e) {
    return toState(e);
  }
}

// ---------------------------------------------------------------------------
// Cotizaciones
// ---------------------------------------------------------------------------

export async function createQuoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    assertPermission(session.role, "CREATE_QUOTES");
    await assertDentalClinic(session.organizationId);

    const data = createQuoteSchema.parse(Object.fromEntries(formData.entries()));
    const seleccionados = formData.getAll("treatmentIds").map((v) => String(v)).filter(Boolean);

    const quote = await createQuoteFromPlan({
      organizationId: session.organizationId,
      patientId: data.patientId,
      userId: session.userId,
      treatmentItemIds: seleccionados,
      validDays: data.validDays,
      extraDiscount: data.extraDiscount,
      notes: data.notes || undefined,
      terms: data.terms || undefined,
    });

    revalidatePath(`/patients/${data.patientId}/odontograma`);
    return { ok: true, message: `Cotización ${quote.folio} generada.` };
  } catch (e) {
    return toState(e);
  }
}

/**
 * Cambia el estado comercial de la cotización.
 *
 * Aceptarla mueve a "aceptado" los tratamientos que seguían pendientes, y hasta
 * ahí. Marcarlos realizados es otro acto, con otro permiso.
 */
export async function setQuoteStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    assertPermission(session.role, "MANAGE_QUOTES");
    await assertDentalClinic(session.organizationId);

    const data = quoteStatusSchema.parse(Object.fromEntries(formData.entries()));
    const patientId = String(formData.get("patientId") || "");

    await setQuoteStatus(session.organizationId, session.userId, data.id, data.status);

    revalidatePath(`/quotes/${data.id}`);
    if (patientId) revalidatePath(`/patients/${patientId}/odontograma`);
    return { ok: true, message: "Estado de la cotización actualizado." };
  } catch (e) {
    return toState(e);
  }
}

/**
 * Envía el presupuesto por correo al paciente.
 *
 * REUTILIZA el envío que ya existe (Resend) y agrega solo la plantilla. El
 * detalle va en el cuerpo del mensaje, no adjunto: Doctovio no genera archivos
 * PDF en el servidor —la receta, la orden y la referencia se imprimen desde el
 * navegador— y no se agregó una librería para esto.
 *
 * Es una acción hacia afuera, así que se dispara solo cuando alguien la pide y
 * queda registrada en la bitácora con la dirección a la que se mandó.
 */
export async function sendQuoteEmailAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    assertPermission(session.role, "MANAGE_QUOTES");
    await assertDentalClinic(session.organizationId);

    const id = String(formData.get("id") || "");
    const quote = await getQuote(session.organizationId, id);
    if (!quote) throw new Error("La cotización no existe en este consultorio.");

    const destino = quote.patient.email?.trim();
    if (!destino) {
      throw new Error("El paciente no tiene correo registrado. Agrégalo en su expediente y vuelve a intentar.");
    }

    const org = await db.organization.findUnique({
      where: { id: session.organizationId },
      select: { name: true },
    });

    const detalle = quote.items
      .map(
        (i) =>
          `<div style="border-bottom:1px solid #e5e7eb;padding:6px 0;">${i.name}` +
          `${i.toothCode ? ` — pieza ${i.toothCode}` : ""}` +
          ` <span style="float:right">${formatMoney(i.total, quote.currency)}</span></div>`
      )
      .join("");

    await sendEmail({
      to: destino,
      subject: `Presupuesto ${quote.folio} — ${org?.name ?? "Consultorio"}`,
      html: templates.quoteIssued({
        folio: quote.folio,
        patientName: quote.patient.firstName,
        clinicName: org?.name ?? "el consultorio",
        detalle: `<div style="margin-top:12px">${detalle}</div>`,
        total: formatMoney(quote.total, quote.currency),
        vigencia: quote.validUntil
          ? `<p style="color:#6b7280;font-size:13px;">Vigente hasta el ${quote.validUntil.toLocaleDateString("es-MX")}.</p>`
          : "",
      }),
    });

    // Al enviarla deja de ser un borrador: eso es exactamente lo que significa
    // "Enviada", y marcarlo a mano después se olvida siempre.
    if (quote.status === "DRAFT") {
      await setQuoteStatus(session.organizationId, session.userId, id, "SENT");
    }

    await logAudit({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "SEND",
      entity: "quote",
      entityId: id,
      newValues: { folio: quote.folio, para: destino },
    });

    revalidatePath(`/quotes/${id}`);
    return { ok: true, message: `Presupuesto enviado a ${destino}.` };
  } catch (e) {
    return toState(e);
  }
}
