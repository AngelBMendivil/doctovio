import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { getUserForEdit } from "@/lib/services/platform-users";
import { listClinicsForPlatform } from "@/lib/services/clinics";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserEditForm, ResetPasswordForm } from "@/components/master/user-edit-form";

export const dynamic = "force-dynamic";

const fecha = (d: Date | null) =>
  d ? new Date(d).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" }) : "Nunca";

export default async function EditarUsuarioPage({ params }: { params: { id: string } }) {
  await requirePlatformAdmin();

  const [user, clinics] = await Promise.all([getUserForEdit(params.id), listClinicsForPlatform()]);
  if (!user) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/master/usuarios"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Usuarios
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-navy">{user.fullName}</h1>
          <Badge tone={user.isActive ? "success" : "default"}>{user.isActive ? "Activo" : "Inactivo"}</Badge>
          {user.isPlatformAdmin && <Badge tone="info">Administrador Maestro</Badge>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Correo", value: user.email },
          { label: "Alias de acceso", value: user.username ?? "—", mono: true },
          { label: "Alta", value: fecha(user.createdAt) },
          { label: "Último acceso", value: fecha(user.lastLoginAt) },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-border bg-card p-4 shadow-card">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{m.label}</div>
            <div className={`mt-1 truncate text-sm font-medium text-navy ${m.mono ? "font-mono" : ""}`} title={m.value}>
              {m.value}
            </div>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos del usuario</CardTitle>
          <CardDescription>
            El correo y el alias no se editan: son su identidad de acceso, y cambiarlos
            es dar de alta a otra persona.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UserEditForm
            user={{
              id: user.id,
              fullName: user.fullName,
              phone: user.phone,
              primaryRole: user.primaryRole,
              isActive: user.isActive,
              isPlatformAdmin: user.isPlatformAdmin,
              organization: { id: user.organization.id },
            }}
            clinics={clinics.map((c) => ({ id: c.id, name: c.name }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Restablecer acceso</CardTitle>
          <CardDescription>
            Cuando alguien olvida su contraseña. Las contraseñas se guardan como hash:
            no hay forma de consultarlas, solo de reemplazarlas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResetPasswordForm email={user.email} />
        </CardContent>
      </Card>
    </div>
  );
}
