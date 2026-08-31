import { requirePlatformAdmin } from "@/lib/auth/session";
import { listProducts } from "@/lib/services/platform-catalog";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductForm } from "@/components/master/master-forms";

export const dynamic = "force-dynamic";

const FREQ = { MONTHLY: "Mensual", YEARLY: "Anual" };

export default async function ProductosPage() {
  await requirePlatformAdmin();

  const products = await listProducts();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy">Productos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          El precio de Doctovio vive aquí. Cambiarlo es editar una fila, no desplegar código.
        </p>
      </div>

      <div className="space-y-4">
        {products.map((p) => (
          <Card key={p.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-3">
                <CardTitle>{p.name}</CardTitle>
                <Badge tone={p.isActive ? "success" : "default"}>{p.isActive ? "Activo" : "Inactivo"}</Badge>
                <code className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{p.code}</code>
              </div>
              <CardDescription>
                {p.price} {p.currency} · {FREQ[p.billingFrequency]} ·{" "}
                {p._count.subscriptions} suscripción(es)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProductForm
                product={{
                  id: p.id,
                  code: p.code,
                  name: p.name,
                  description: p.description,
                  price: p.price,
                  currency: p.currency,
                  billingFrequency: p.billingFrequency,
                  isActive: p.isActive,
                }}
              />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nuevo producto</CardTitle>
          <CardDescription>
            Planes, add-ons, usuarios adicionales, IA, WhatsApp, almacenamiento: cada
            uno es una fila más, sin tocar el código.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProductForm />
        </CardContent>
      </Card>
    </div>
  );
}
