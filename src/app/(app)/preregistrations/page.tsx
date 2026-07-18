import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { listPreRegistrations } from "@/lib/services/preregistration";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GenerateLink } from "./generate-link";

const STATUS_LABEL: Record<string, string> = {
  GENERATED: "Enlace generado",
  OPENED: "Abierto por el paciente",
  STARTED: "En proceso",
  SUBMITTED: "Enviado — por revisar",
};

export default async function PreRegistrationsPage() {
  const session = await getSession();
  if (!session) return null;

  const items = await listPreRegistrations(session.organizationId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Prerregistros de pacientes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Genera un enlace para que un paciente nuevo llene sus datos y su historia clínica desde su celular.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Nuevo prerregistro</CardTitle></CardHeader>
        <CardContent>
          <GenerateLink />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Prerregistros ({items.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {items.length === 0 && (
            <p className="text-muted-foreground">Aún no hay prerregistros. Genera un enlace arriba.</p>
          )}
          {items.map((t) => {
            const payload = (t.payloadJson as Record<string, unknown> | null) ?? null;
            const name = payload
              ? `${String(payload.firstName ?? "")} ${String(payload.lastName1 ?? "")}`.trim()
              : null;
            const submitted = t.status === "SUBMITTED";
            const linkedToPatient = Boolean(t.patientId); // cita de primera vez: ya se aplicó al expediente
            return (
              <div key={t.id} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0">
                <div>
                  <p className="font-medium">
                    {submitted && linkedToPatient && <span className="mr-1 text-green-700">✓</span>}
                    {submitted && name ? name : "Paciente sin capturar"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {submitted && linkedToPatient
                      ? "Prerregistro completado · expediente actualizado"
                      : STATUS_LABEL[t.status] ?? t.status}
                    {" · creado "}{t.createdAt.toLocaleDateString("es-MX")}
                  </p>
                </div>
                {submitted && linkedToPatient ? (
                  <Link
                    href={`/patients/${t.patientId}`}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                  >
                    Ver expediente
                  </Link>
                ) : submitted ? (
                  <Link
                    href={`/preregistrations/${t.id}`}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                  >
                    Revisar y convertir
                  </Link>
                ) : (
                  <span className="text-xs text-muted-foreground">Esperando al paciente</span>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
