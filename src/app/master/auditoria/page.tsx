import { requirePlatformAdmin } from "@/lib/auth/session";
import { listPlatformAudit } from "@/lib/services/platform-audit";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const cuando = (d: Date) =>
  new Date(d).toLocaleString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const ENTIDAD = {
  clinic: "Consultorio",
  clinic_user: "Usuario",
  product: "Producto",
  subscription: "Suscripción",
  billing_cycle: "Mensualidad",
  payment: "Pago",
} as Record<string, string>;

const ACCION = {
  CREATE: { text: "Creó", tone: "success" as const },
  UPDATE: { text: "Modificó", tone: "info" as const },
  DELETE: { text: "Eliminó", tone: "danger" as const },
  SOFT_DELETE: { text: "Desactivó", tone: "warning" as const },
  PERMISSION_CHANGE: { text: "Cambió permisos", tone: "warning" as const },
} as Record<string, { text: string; tone: "success" | "info" | "danger" | "warning" | "default" }>;

export default async function AuditoriaPage() {
  await requirePlatformAdmin();

  const rows = await listPlatformAudit({ limit: 200 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy">Auditoría</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Acciones administrativas del Master. Aquí se toca el acceso y el dinero de
          terceros: todo queda registrado.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Cuándo</th>
                <th className="px-4 py-3 font-medium">Quién</th>
                <th className="px-4 py-3 font-medium">Acción</th>
                <th className="px-4 py-3 font-medium">Sobre</th>
                <th className="px-4 py-3 font-medium">Consultorio</th>
                <th className="px-4 py-3 font-medium">Detalle</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const a = ACCION[r.action] ?? { text: r.action, tone: "default" as const };

                return (
                  <tr key={r.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{cuando(r.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span className="text-navy">{r.who}</span>
                      {r.whoEmail && <div className="text-[11px] text-muted-foreground">{r.whoEmail}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={a.tone}>{a.text}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{ENTIDAD[r.entity] ?? r.entity}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.clinic ?? "—"}</td>
                    <td className="px-4 py-3">
                      {r.metadata ? (
                        <code className="block max-w-md break-words text-[11px] text-muted-foreground">
                          {Object.entries(r.metadata)
                            .map(([k, v]) => `${k}: ${String(v)}`)
                            .join(" · ")}
                        </code>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    Todavía no hay acciones registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Solo acciones de plataforma. La bitácora clínica de cada consultorio es aparte
        y no se mezcla aquí.
      </p>
    </div>
  );
}
