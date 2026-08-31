import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { listAllUsers } from "@/lib/services/platform-users";
import { listClinicsForPlatform } from "@/lib/services/clinics";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateUserForm, UserRowActions } from "@/components/master/master-forms";

export const dynamic = "force-dynamic";

const ROL = { ADMIN: "Administrativo", DOCTOR: "Doctor", ASSISTANT: "Secretaria" };
const fecha = (d: Date | null) =>
  d ? new Date(d).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "Nunca";

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: { consultorio?: string; q?: string };
}) {
  await requirePlatformAdmin();

  const [users, clinics] = await Promise.all([
    listAllUsers({ organizationId: searchParams.consultorio, search: searchParams.q }),
    listClinicsForPlatform(),
  ]);

  const opciones = clinics.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy">Usuarios</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {users.length} usuario(s) en {clinics.length} consultorio(s).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/master/usuarios"
          className={
            !searchParams.consultorio
              ? "rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
              : "rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:text-primary"
          }
        >
          Todos
        </Link>
        {opciones.map((c) => (
          <Link
            key={c.id}
            href={`/master/usuarios?consultorio=${c.id}`}
            className={
              searchParams.consultorio === c.id
                ? "rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                : "rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:text-primary"
            }
          >
            {c.name}
          </Link>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Correo</th>
                <th className="px-4 py-3 font-medium">Consultorio</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Último acceso</th>
                <th className="px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {users.map((u) => (
                <tr key={u.id} className={u.isActive ? "" : "bg-muted/30"}>
                  <td className="px-4 py-3">
                    <span className={u.isActive ? "font-medium text-navy" : "text-muted-foreground"}>{u.fullName}</span>
                    {u.isPlatformAdmin && (
                      <Badge tone="info" className="ml-2">Master</Badge>
                    )}
                    <div className="text-xs text-muted-foreground">{ROL[u.primaryRole]}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-3">
                    <Link href={`/master/consultorios/${u.organization.id}`} className="text-muted-foreground hover:text-primary">
                      {u.organization.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={u.isActive ? "success" : "default"}>{u.isActive ? "Activo" : "Inactivo"}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{fecha(u.lastLoginAt)}</td>
                  <td className="px-4 py-3">
                    <UserRowActions
                      userId={u.id}
                      isActive={u.isActive}
                      role={u.primaryRole}
                      organizationId={u.organization.id}
                      clinics={opciones}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Los usuarios nunca se borran, solo se desactivan: uno borrado dejaría
        huérfanas las citas que creó y las recetas que firmó.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Nuevo usuario</CardTitle>
          <CardDescription>Respeta el tope de usuarios del plan del consultorio.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateUserForm clinics={opciones} />
        </CardContent>
      </Card>
    </div>
  );
}
