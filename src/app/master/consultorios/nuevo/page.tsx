import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { listProducts } from "@/lib/services/platform-catalog";
import { Card, CardContent } from "@/components/ui/card";
import { NewClinicForm } from "@/components/master/master-forms";

export const dynamic = "force-dynamic";

export default async function NuevoConsultorioPage() {
  await requirePlatformAdmin();

  const products = await listProducts(true);

  const hoy = new Date();
  const iso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/master/consultorios"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Consultorios
        </Link>

        <h1 className="mt-3 text-2xl font-semibold text-navy">Nuevo consultorio</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Al guardar te llevo a la pestaña de usuarios para dar de alta al resto del equipo.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <NewClinicForm
            products={products.map((p) => ({
              id: p.id,
              name: p.name,
              code: p.code,
              price: p.price,
              currency: p.currency,
            }))}
            hoy={iso}
          />
        </CardContent>
      </Card>
    </div>
  );
}
