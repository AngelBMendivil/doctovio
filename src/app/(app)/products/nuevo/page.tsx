import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/rbac";
import { isDentalClinic } from "@/lib/services/clinic-features";
import { listCategories, ensureCategories } from "@/lib/services/catalog";
import { createCatalogItemAction, createCategoryAction } from "@/lib/actions/catalog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsForm } from "@/app/(app)/settings/settings-form";
import { ProductFields } from "@/components/dental/product-form";

const GRID = "grid grid-cols-1 gap-4 md:grid-cols-2";

export default async function NuevoProductoPage() {
  const session = await getSession();
  if (!session) return null;

  if (!(await isDentalClinic(session.organizationId))) redirect("/dashboard");
  if (!hasPermission(session.role, "MANAGE_PRODUCTS")) redirect("/products");

  await ensureCategories(session.organizationId);
  const categorias = await listCategories(session.organizationId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/products" className="text-sm text-primary hover:underline">
          ← Volver al catálogo
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Nuevo producto o servicio</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingsForm action={createCatalogItemAction} submitLabel="Guardar" className={GRID} resetOnSuccess>
            <ProductFields categorias={categorias.map((c) => ({ id: c.id, name: c.name }))} />
          </SettingsForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agregar una categoría</CardTitle>
          <p className="text-sm text-muted-foreground">
            Las categorías son del consultorio. Puedes usar las sugeridas o crear las tuyas.
          </p>
        </CardHeader>
        <CardContent>
          <SettingsForm action={createCategoryAction} submitLabel="Agregar categoría" className={GRID} resetOnSuccess>
            <div className="md:col-span-2">
              <Label htmlFor="name" required>
                Nombre de la categoría
              </Label>
              <Input id="name" name="name" required placeholder="Odontopediatría" />
            </div>
          </SettingsForm>
        </CardContent>
      </Card>
    </div>
  );
}
