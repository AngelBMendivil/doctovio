"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/**
 * Alta y edición de un producto o servicio del consultorio.
 *
 * Los mismos campos para las dos pantallas: si el alta y la edición se
 * escriben por separado, tarde o temprano una gana un campo que la otra no
 * tiene.
 */
export function ProductFields({
  categorias,
  monedaPorOmision = "MXN",
  item,
}: {
  categorias: { id: string; name: string }[];
  /** La del consultorio. Cada renglón puede llevar la suya. */
  monedaPorOmision?: string;
  item?: {
    id: string;
    name: string;
    code: string | null;
    type: string;
    categoryId: string | null;
    description: string | null;
    price: number;
    currency: string;
    taxRate: number | null;
    isActive: boolean;
  };
}) {
  return (
    <>
      {item && <input type="hidden" name="id" value={item.id} />}

      <div>
        <Label htmlFor="name" required>
          Nombre
        </Label>
        <Input id="name" name="name" required defaultValue={item?.name} placeholder="Resina posterior" />
      </div>

      <div>
        <Label htmlFor="code">Código interno</Label>
        <Input id="code" name="code" defaultValue={item?.code ?? ""} placeholder="RES001" />
        <p className="mt-1 text-xs text-muted-foreground">Opcional. No se puede repetir dentro del consultorio.</p>
      </div>

      <div>
        <Label htmlFor="type">Tipo</Label>
        <Select id="type" name="type" defaultValue={item?.type ?? "SERVICE"}>
          <option value="SERVICE">Servicio — se hace</option>
          <option value="PRODUCT">Producto — se entrega</option>
        </Select>
      </div>

      <div>
        <Label htmlFor="categoryId">Categoría</Label>
        <Select id="categoryId" name="categoryId" defaultValue={item?.categoryId ?? ""}>
          <option value="">Sin categoría</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="price" required>
          Precio
        </Label>
        <div className="flex gap-2">
          <Input id="price" name="price" inputMode="decimal" required defaultValue={item?.price ?? ""} />
          {/* La moneda va PEGADA al precio porque un número sin moneda no es un
              precio. En la frontera se cobra en las dos y la diferencia entre
              50 y 50 es de veinte veces. */}
          <Select
            name="currency"
            aria-label="Moneda"
            defaultValue={item?.currency ?? monedaPorOmision}
            className="w-32"
          >
            <option value="MXN">MXN</option>
            <option value="USD">USD</option>
          </Select>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Cambiarlo no altera cotizaciones ni tratamientos ya registrados.
        </p>
      </div>

      <div>
        <Label htmlFor="taxRate">Impuesto (%)</Label>
        <Input
          id="taxRate"
          name="taxRate"
          inputMode="decimal"
          defaultValue={item?.taxRate ?? ""}
          placeholder="16"
        />
        <p className="mt-1 text-xs text-muted-foreground">Déjalo vacío si no aplica.</p>
      </div>

      <div className="md:col-span-2">
        <Label htmlFor="description">Descripción</Label>
        <Textarea id="description" name="description" rows={2} defaultValue={item?.description ?? ""} />
      </div>

      {item && (
        <div className="flex items-center gap-2 md:col-span-2">
          <input
            type="checkbox"
            id="isActive"
            name="isActive"
            defaultChecked={item.isActive}
            className="h-4 w-4"
          />
          <Label htmlFor="isActive" className="mb-0">
            Activo — aparece al planear tratamientos y al cotizar
          </Label>
        </div>
      )}
    </>
  );
}
