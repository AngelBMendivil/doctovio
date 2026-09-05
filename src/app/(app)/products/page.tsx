import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/rbac";
import { isDentalClinic } from "@/lib/services/clinic-features";
import { listCatalogItems, listCategories, ensureCategories } from "@/lib/services/catalog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductFilters } from "@/components/dental/product-filters";
import { formatMoney } from "@/lib/utils/money";
import type { CatalogItemType } from "@prisma/client";

/**
 * PRODUCTOS Y SERVICIOS DEL CONSULTORIO.
 *
 * No confundir con /master/productos, que es el catálogo de Doctovio: lo que el
 * consultorio le paga a la plataforma. Esta pantalla es lo que el consultorio le
 * cobra a SU paciente, y cada uno administra el suyo.
 */
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: { q?: string; categoria?: string; tipo?: string; estado?: string };
}) {
  const session = await getSession();
  if (!session) return null;

  if (!(await isDentalClinic(session.organizationId))) redirect("/dashboard");
  if (!hasPermission(session.role, "VIEW_PRODUCTS")) redirect("/dashboard");

  const puedeEditar = hasPermission(session.role, "MANAGE_PRODUCTS");

  // Las categorías sugeridas se siembran la primera vez y solo la primera.
  if (puedeEditar) await ensureCategories(session.organizationId);

  const [items, categorias] = await Promise.all([
    listCatalogItems(session.organizationId, {
      search: searchParams.q,
      categoryId: searchParams.categoria,
      type: searchParams.tipo as CatalogItemType | undefined,
      estado: searchParams.estado,
    }),
    listCategories(session.organizationId),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Productos y servicios</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            El catálogo del consultorio: lo que se cobra por cada tratamiento y lo que se entrega.
          </p>
        </div>
        {puedeEditar && (
          <Link href="/products/nuevo">
            <Button size="sm">Nuevo +</Button>
          </Link>
        )}
      </div>

      <Card>
        <CardContent className="pt-5">
          <ProductFilters categorias={categorias.map((c) => ({ id: c.id, name: c.name }))} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Catálogo ({items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No hay nada con esos filtros.
              {puedeEditar && " Da de alta el primer servicio con el botón Nuevo."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-2">Nombre</th>
                    <th className="px-2 py-2">Código</th>
                    <th className="px-2 py-2">Tipo</th>
                    <th className="px-2 py-2">Categoría</th>
                    <th className="px-2 py-2 text-right">Precio</th>
                    <th className="px-2 py-2">Estado</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id} className="border-b border-border last:border-0">
                      <td className="px-2 py-2.5 font-medium">
                        {i.name}
                        {i.description && (
                          <span className="block text-[11px] font-normal text-muted-foreground">
                            {i.description}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-muted-foreground">{i.code ?? "—"}</td>
                      <td className="px-2 py-2.5">{i.type === "SERVICE" ? "Servicio" : "Producto"}</td>
                      <td className="px-2 py-2.5 text-muted-foreground">{i.category?.name ?? "—"}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">
                        {formatMoney(i.price, i.currency)}
                        {i.taxRate ? (
                          <span className="block text-[11px] text-muted-foreground">+{i.taxRate}%</span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2.5">
                        <Badge tone={i.isActive ? "success" : "default"}>
                          {i.isActive ? "Activo" : "Inactivo"}
                        </Badge>
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        {puedeEditar && (
                          <Link
                            href={`/products/${i.id}`}
                            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                          >
                            Editar
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
