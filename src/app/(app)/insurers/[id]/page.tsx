import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getInsurer } from "@/lib/services/insurers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SettingsForm } from "@/app/(app)/settings/settings-form";
import { updateInsurerAction } from "@/lib/actions/insurers";

const GRID = "grid grid-cols-1 gap-4 md:grid-cols-2";

export default async function EditInsurerPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return null;
  if (session.role !== "ADMIN") {
    return <p className="text-sm text-muted-foreground">Solo el administrador puede editar aseguradoras.</p>;
  }

  const ins = await getInsurer(session.organizationId, params.id);
  if (!ins) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Editar aseguradora</h1>
        <Link href="/insurers" className="text-sm text-primary underline">Volver al catálogo</Link>
      </div>

      <Card>
        <CardHeader><CardTitle>{ins.name}</CardTitle></CardHeader>
        <CardContent>
          <SettingsForm action={updateInsurerAction} submitLabel="Guardar cambios" className={GRID}>
            <input type="hidden" name="id" value={ins.id} />
            <div>
              <Label>Nombre *</Label>
              <Input name="name" required defaultValue={ins.name} />
            </div>
            <div>
              <Label>Código / clave</Label>
              <Input name="code" defaultValue={ins.code ?? ""} />
            </div>
            <div>
              <Label>Teléfono de contacto</Label>
              <Input name="contactPhone" defaultValue={ins.contactPhone ?? ""} />
            </div>
            <div>
              <Label>Correo de contacto</Label>
              <Input name="contactEmail" type="email" defaultValue={ins.contactEmail ?? ""} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                name="requiresPreAuthorization"
                id="requiresPreAuthorization"
                defaultChecked={ins.requiresPreAuthorization}
              />
              <Label htmlFor="requiresPreAuthorization" className="mb-0">Requiere autorización previa</Label>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input type="checkbox" name="isActive" id="isActive" defaultChecked={ins.isActive} />
              <Label htmlFor="isActive" className="mb-0">Aseguradora activa</Label>
            </div>
            <div className="md:col-span-2">
              <Label>Instrucciones de autorización</Label>
              <Textarea name="authorizationInstructions" rows={2} defaultValue={ins.authorizationInstructions ?? ""} />
            </div>
            <div className="md:col-span-2">
              <Label>Documentos / requisitos (uno por línea)</Label>
              <Textarea name="requiredDocuments" rows={4} defaultValue={ins.requiredDocuments ?? ""} />
              <p className="mt-1 text-xs text-muted-foreground">
                Cambiar esta lista no altera el checklist de pacientes ya ligados; aplica a nuevos enlaces.
              </p>
            </div>
            <div className="md:col-span-2">
              <Label>Notas de protocolo</Label>
              <Textarea name="protocolNotes" rows={2} defaultValue={ins.protocolNotes ?? ""} />
            </div>
            <div className="md:col-span-2">
              <Label>Notas de cobertura</Label>
              <Textarea name="coverageNotes" rows={2} defaultValue={ins.coverageNotes ?? ""} />
            </div>
          </SettingsForm>
        </CardContent>
      </Card>
    </div>
  );
}
