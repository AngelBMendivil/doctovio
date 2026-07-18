import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { listInsurers } from "@/lib/services/insurers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SettingsForm } from "@/app/(app)/settings/settings-form";
import { createInsurerAction } from "@/lib/actions/insurers";

const GRID = "grid grid-cols-1 gap-4 md:grid-cols-2";

export default async function InsurersPage() {
  const session = await getSession();
  if (!session) return null;
  if (session.role !== "ADMIN") {
    return <p className="text-sm text-muted-foreground">Solo el administrador puede gestionar el catálogo de aseguradoras.</p>;
  }

  const insurers = await listInsurers(session.organizationId, false);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Aseguradoras</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Catálogo de aseguradoras del consultorio. Cada una define sus requisitos y protocolo,
          que luego se aplican al ligarla a un paciente.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Catálogo ({insurers.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {insurers.length === 0 && (
            <p className="text-muted-foreground">Aún no hay aseguradoras. Agrega la primera abajo.</p>
          )}
          {insurers.map((ins) => (
            <div key={ins.id} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0">
              <div>
                <p className="font-medium">{ins.name}{!ins.isActive && " (inactiva)"}</p>
                <p className="text-xs text-muted-foreground">
                  {ins.requiresPreAuthorization ? "Requiere autorización previa" : "Sin autorización previa"}
                  {ins.requiredDocuments
                    ? ` · ${ins.requiredDocuments.split(/\r?\n/).filter(Boolean).length} requisito(s)`
                    : ""}
                  {ins.contactPhone ? ` · Tel. ${ins.contactPhone}` : ""}
                </p>
              </div>
              <Link
                href={`/insurers/${ins.id}`}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                Editar
              </Link>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Agregar aseguradora</CardTitle></CardHeader>
        <CardContent>
          <SettingsForm action={createInsurerAction} submitLabel="Guardar aseguradora" className={GRID} resetOnSuccess>
            <div>
              <Label>Nombre *</Label>
              <Input name="name" required />
            </div>
            <div>
              <Label>Código / clave</Label>
              <Input name="code" />
            </div>
            <div>
              <Label>Teléfono de contacto</Label>
              <Input name="contactPhone" />
            </div>
            <div>
              <Label>Correo de contacto</Label>
              <Input name="contactEmail" type="email" />
            </div>
            <div className="flex items-center gap-2 pt-6 md:col-span-2">
              <input type="checkbox" name="requiresPreAuthorization" id="requiresPreAuthorization" />
              <Label htmlFor="requiresPreAuthorization" className="mb-0">Requiere autorización previa antes de atender</Label>
            </div>
            <div className="md:col-span-2">
              <Label>Instrucciones de autorización</Label>
              <Textarea name="authorizationInstructions" rows={2} placeholder="Ej. Llamar al 800... con la póliza para obtener número de autorización." />
            </div>
            <div className="md:col-span-2">
              <Label>Documentos / requisitos (uno por línea)</Label>
              <Textarea name="requiredDocuments" rows={4} placeholder={"Copia de identificación\nCarnet de la aseguradora\nOrden de atención autorizada"} />
              <p className="mt-1 text-xs text-muted-foreground">
                Cada línea se convierte en un punto del checklist de seguimiento del paciente.
              </p>
            </div>
            <div className="md:col-span-2">
              <Label>Notas de protocolo</Label>
              <Textarea name="protocolNotes" rows={2} />
            </div>
            <div className="md:col-span-2">
              <Label>Notas de cobertura</Label>
              <Textarea name="coverageNotes" rows={2} />
            </div>
          </SettingsForm>
        </CardContent>
      </Card>
    </div>
  );
}
