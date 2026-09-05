import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/rbac";
import { isDentalClinic } from "@/lib/services/clinic-features";
import { getCatalogItem, listCategories, countCatalogItemUsage } from "@/lib/services/catalog";
import { updateCatalogItemAction } from "@/lib/actions/catalog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsForm } from "@/app/(app)/settings/settings-form";
import { ProductFields } from "@/components/dental/product-form";

const GRID = "grid grid-cols-1 gap-4 md:grid-cols-2";

/**
 * Edición con guardado EXPLÍCITO: se cambian los campos y se presiona Guardar.
 *
 * Nada se modifica al soltar un desplegable. Esta pantalla existe justamente
 * porque en el panel Master hubo un `select` que guardaba al cambiar y rozar la
 * rueda del mouse reasignaba el rol de una persona sin que nadie lo confirmara.
 */
export default async function EditarProductoPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return null;

  if (!(await isDentalClinic(session.organizationId))) redirect("/dashboard");
  if (!hasPermission(session.role, "MANAGE_PRODUCTS")) redirect("/products");

  const [item, categorias] = await Promise.all([
    getCatalogItem(session.organizationId, params.id),
    listCategories(session.organizationId),
  ]);
  if (!item) notFound();

  const uso = await countCatalogItemUsage(session.organizationId, item.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/products" className="text-sm text-primary hover:underline">
          ← Volver al catálogo
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{item.name}</h1>
        <p className="text-sm text-muted-foreground">
          {uso.total === 0
            ? "Todavía no se ha usado en ningún tratamiento ni cotización."
            : `Usado en ${uso.tratamientos} tratamiento(s) y ${uso.cotizaciones} concepto(s) de cotización.`}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingsForm action={updateCatalogItemAction} submitLabel="Guardar cambios" className={GRID}>
            <ProductFields
              categorias={categorias.map((c) => ({ id: c.id, name: c.name }))}
              item={{
                id: item.id,
                name: item.name,
                code: item.code,
                type: item.type,
                categoryId: item.categoryId,
                description: item.description,
                price: item.price,
                currency: item.currency,
                taxRate: item.taxRate,
                isActive: item.isActive,
              }}
            />
          </SettingsForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Por qué no hay botón de borrar</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Un producto que estuvo en una cotización no se puede eliminar sin dejar hueca una hoja que
          ya se le entregó al paciente. Para sacarlo de las listas, desmarca <strong>Activo</strong>:
          deja de aparecer al planear y al cotizar, y lo histórico sigue completo.
        </CardContent>
      </Card>
    </div>
  );
}
