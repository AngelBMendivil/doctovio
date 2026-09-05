import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/rbac";
import { isDentalClinic } from "@/lib/services/clinic-features";
import { getQuote, quoteStateLabel, isExpired } from "@/lib/services/quotes";
import { getLetterhead } from "@/lib/services/letterhead";
import { setQuoteStatusAction, sendQuoteEmailAction } from "@/lib/actions/dental";
import { QuoteDocument, type QuoteDocProps } from "./quote-document";
import { PrintButton } from "@/app/(app)/prescriptions/[id]/print-button";
import { ActionButton } from "@/components/dental/action-button";

/**
 * LA COTIZACIÓN, TAL COMO SE EMITIÓ.
 *
 * Los conceptos se leen de `quote_items`, que guardan su propio nombre y su
 * propio precio. No se recalcula nada contra el catálogo: si la resina subió el
 * mes pasado, esta hoja sigue diciendo lo que se le prometió al paciente.
 *
 * El "PDF" es la impresión del navegador, igual que en la receta. No se agregó
 * ninguna librería nueva: es la misma infraestructura de documentos.
 */
export default async function QuotePage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return null;

  if (!(await isDentalClinic(session.organizationId))) redirect("/dashboard");
  if (!hasPermission(session.role, "VIEW_QUOTES")) redirect("/dashboard");

  const quote = await getQuote(session.organizationId, params.id);
  if (!quote) notFound();

  // El membrete se arma con el médico que la creó: es el mismo de la receta y
  // de la orden médica, con lo que se haya configurado en Configuración.
  const lh = await getLetterhead(session.organizationId, quote.createdById);

  const canManage = hasPermission(session.role, "MANAGE_QUOTES");
  const vencida = isExpired(quote);
  const anulada = ["CANCELLED", "REJECTED"].includes(quote.status);

  const props: QuoteDocProps = {
    lh,
    folio: quote.folio,
    dateStr: new Date(quote.issuedAt).toLocaleDateString("es-MX", { dateStyle: "long" }),
    validStr: quote.validUntil
      ? new Date(quote.validUntil).toLocaleDateString("es-MX", { dateStyle: "long" })
      : null,
    patientName: `${quote.patient.firstName} ${quote.patient.lastLastName} ${
      quote.patient.secondLastName ?? ""
    }`.trim(),
    recordNumber: quote.patient.recordNumber,
    estado: quoteStateLabel(quote),
    anulada,
    currency: quote.currency,
    items: quote.items.map((i) => ({
      id: i.id,
      name: i.name,
      description: i.description,
      toothCode: i.toothCode,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      discount: i.discount,
      total: i.total,
    })),
    subtotal: quote.subtotal,
    discount: quote.discount,
    tax: quote.tax,
    total: quote.total,
    notes: quote.notes,
    terms: quote.terms,
  };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 space-y-3 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/patients/${quote.patientId}/odontograma?tab=cotizaciones`}
            className="text-sm text-primary hover:underline"
          >
            ← Volver al odontograma
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            {canManage && quote.patient.email && (
              <ActionButton
                action={sendQuoteEmailAction}
                fields={{ id: quote.id }}
                label="Enviar por correo"
                confirmar={`¿Enviar el presupuesto ${quote.folio} a ${quote.patient.email}?`}
              />
            )}
            <PrintButton />
          </div>
        </div>

        {canManage && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
            <span className="mr-1 text-sm text-muted-foreground">
              Estado comercial: <strong className="text-foreground">{quoteStateLabel(quote)}</strong>
            </span>
            {quote.status !== "ACCEPTED" && !anulada && (
              <ActionButton
                action={setQuoteStatusAction}
                fields={{ id: quote.id, patientId: quote.patientId, status: "ACCEPTED" }}
                label="Marcar aceptada"
                variant="success"
                confirmar="Aceptar la cotización pasa los tratamientos a “aceptado”. NO los marca como realizados."
              />
            )}
            {quote.status === "DRAFT" && (
              <ActionButton
                action={setQuoteStatusAction}
                fields={{ id: quote.id, patientId: quote.patientId, status: "SENT" }}
                label="Marcar enviada"
              />
            )}
            {!anulada && quote.status !== "REJECTED" && (
              <ActionButton
                action={setQuoteStatusAction}
                fields={{ id: quote.id, patientId: quote.patientId, status: "REJECTED" }}
                label="Marcar rechazada"
                variant="ghost"
              />
            )}
            {!anulada && (
              <ActionButton
                action={setQuoteStatusAction}
                fields={{ id: quote.id, patientId: quote.patientId, status: "CANCELLED" }}
                label="Cancelar"
                variant="ghost"
                confirmar="¿Cancelar esta cotización? No se podrá reabrir; habría que generar una nueva."
              />
            )}
          </div>
        )}

        {/* Aceptar es comercial; realizar es clínico. Es la confusión que hace
            que un expediente diga que se hizo algo que nadie hizo. */}
        {quote.status === "ACCEPTED" && (
          <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Aceptada el {quote.decidedAt?.toLocaleDateString("es-MX")}
            {quote.decidedBy ? ` por ${quote.decidedBy.fullName}` : ""}. Los tratamientos quedaron en
            “aceptado”; marcarlos como realizados se hace desde el plan, cuando se ejecuten.
          </p>
        )}

        {vencida && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            La vigencia de este presupuesto terminó. Los precios pueden haber cambiado; genera uno
            nuevo si el paciente sigue interesado.
          </p>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: "@page{size:letter;margin:14mm}" }} />
      <QuoteDocument {...props} />
    </div>
  );
}
