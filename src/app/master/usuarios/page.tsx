import Link from "next/link";
import { Pencil } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { listAllUsers } from "@/lib/services/platform-users";
import { listClinicsForPlatform } from "@/lib/services/clinics";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateUserForm } from "@/components/master/master-forms";
import { UserFilters } from "@/components/master/user-filters";
import type { UserRoleName } from "@prisma/client";

export const dynamic = "force-dynamic";

const ROL = { ADMIN: "Administrativo", DOCTOR: "Doctor", ASSISTANT: "Secretaria" };
const fecha = (d: Date | null) =>
  d ? new Date(d).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "Nunca";

const ROLES_VALIDOS: UserRoleName[] = ["ADMIN", "DOCTOR", "ASSISTANT"];

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: { consultorio?: string; rol?: string; estado?: string; q?: string };
}) {
  await requirePlatformAdmin();

  const rol = ROLES_VALIDOS.includes(searchParams.rol as UserRoleName)
    ? (searchParams.rol as UserRoleName)
    : undefined;

  // "activo" / "inactivo" / nada. Se traduce a booleano aquí y no en el
  // servicio, para que el servicio no tenga que conocer el vocabulario de la URL.
  const isActive =
    searchParams.estado === "activo" ? true : searchParams.estado === "inactivo" ? false : undefined;

  const [users, clinics] = await Promise.all([
    listAllUsers({ organizationId: searchParams.consultorio, role: rol, isActive, search: searchParams.q }),
    listClinicsForPlatform(),
  ]);

  const opciones = clinics.map((c) => ({ id: c.id, name: c.name }));
  const hayFiltros = Boolean(searchParams.consultorio || searchParams.rol || searchParams.estado || searchParams.q);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy">Usuarios</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {hayFiltros
            ? `${users.length} de los usuarios de la plataforma`
            : `${users.length} usuario(s) en ${clinics.length} consultorio(s)`}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-card">
        <UserFilters clinics={opciones} />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Acceso</th>
                <th className="px-4 py-3 font-medium">Consultorio</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Último acceso</th>
                <th className="px-4 py-3 text-right font-medium">Acción</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {users.map((u) => (
                <tr key={u.id} className={u.isActive ? "transition-colors hover:bg-muted/40" : "bg-muted/30"}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/master/usuarios/${u.id}`}
                      className={u.isActive ? "font-medium text-navy hover:text-primary" : "text-muted-foreground hover:text-primary"}
                    >
                      {u.fullName}
                    </Link>
                    {u.isPlatformAdmin && <Badge tone="info" className="ml-2">Master</Badge>}
                    <div className="text-xs text-muted-foreground">{ROL[u.primaryRole]}</div>
                  </td>

                  <td className="px-4 py-3">
                    {u.username && (
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px] text-navy">{u.username}</code>
                    )}
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </td>

                  <td className="px-4 py-3">
                    <Link
                      href={`/master/consultorios/${u.organization.id}`}
                      className="text-muted-foreground hover:text-primary"
                    >
                      {u.organization.name}
                    </Link>
                  </td>

                  <td className="px-4 py-3">
                    <Badge tone={u.isActive ? "success" : "default"}>{u.isActive ? "Activo" : "Inactivo"}</Badge>
                  </td>

                  <td className="px-4 py-3 text-muted-foreground">{fecha(u.lastLoginAt)}</td>

                  <td className="px-4 py-3 text-right">
                    {/* Editar abre su propia pantalla. Antes había aquí unos
                        desplegables que guardaban al cambiar: rozar la rueda del
                        mouse reasignaba el rol de alguien sin confirmación. */}
                    <Link
                      href={`/master/usuarios/${u.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[13px] font-medium text-primary transition-colors hover:border-primary/40 hover:bg-primary/5"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      Editar
                    </Link>
                  </td>
                </tr>
              ))}

              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    Ningún usuario coincide con esos filtros.
                  </td>
                </tr>
              )}
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
