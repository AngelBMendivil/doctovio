import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { listPendingPayments } from "@/lib/services/billing";
import { calculateAge } from "@/lib/utils/age";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PaymentsPage() {
  const session = await getSession();
  if (!session) return null;

  const pending = await listPendingPayments(session.organizationId);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Por pagar</h1>
        <p className="text-sm text-muted-foreground">Consultas finalizadas pendientes de cobro ({pending.length}).</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Pendientes de pago</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {pending.length === 0 && (
            <p className="text-sm text-muted-foreground">No hay consultas por cobrar. Aparecen aquí al finalizar una consulta.</p>
          )}
          {pending.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm">
              <div>
                <p className="font-medium">{c.patient.firstName} {c.patient.lastLastName}</p>
                <p className="text-xs text-muted-foreground">
                  {calculateAge(c.patient.birthDate)} años · Dr(a). {c.doctor.fullName} ·{" "}
                  {c.finalizedAt ? new Date(c.finalizedAt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "—"}
                </p>
              </div>
              <Link
                href={`/payments/${c.id}`}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
              >
                Cobrar
              </Link>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
