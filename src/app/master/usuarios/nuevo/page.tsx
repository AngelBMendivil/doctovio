import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { listClinicsForPlatform } from "@/lib/services/clinics";
import { Card, CardContent } from "@/components/ui/card";
import { CreateUserForm } from "@/components/master/master-forms";

export const dynamic = "force-dynamic";

export default async function NuevoUsuarioPage({
  searchParams,
}: {
  searchParams: { consultorio?: string };
}) {
  await requirePlatformAdmin();

  const clinics = await listClinicsForPlatform();

  // Llegando desde el detalle de un consultorio, ese queda preseleccionado.
  const preseleccion = clinics.some((c) => c.id === searchParams.consultorio)
    ? searchParams.consultorio
    : undefined;

  const destino = clinics.find((c) => c.id === preseleccion);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={destino ? `/master/consultorios/${destino.id}?tab=usuarios` : "/master/usuarios"}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {destino ? destino.name : "Usuarios"}
        </Link>

        <h1 className="mt-3 text-2xl font-semibold text-navy">Nuevo usuario</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {destino
            ? `Se dará de alta en ${destino.name}.`
            : "Elige el consultorio al que pertenece."}
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <CreateUserForm
            clinics={clinics.map((c) => ({ id: c.id, name: c.name, code: c.code }))}
            preseleccion={preseleccion}
          />
        </CardContent>
      </Card>
    </div>
  );
}
