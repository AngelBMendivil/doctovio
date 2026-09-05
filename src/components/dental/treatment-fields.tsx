"use client";

import { useState } from "react";
import { TREATMENTS, SURFACES, surfaceLabel, isWholeToothCode } from "@/lib/constants/odontograma";
import { formatMoney, lineTotal } from "@/lib/utils/money";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type CatalogOption = {
  id: string;
  name: string;
  price: number;
  categoryName: string | null;
};

/**
 * Alta de un tratamiento en el plan.
 *
 * El precio se CARGA del catálogo al elegir el producto, y a partir de ahí es
 * un campo más: quien tenga permiso puede cobrarle otra cosa a este paciente.
 * Los dos números se guardan —el de lista y el aplicado— porque después nadie
 * se acuerda de si hubo descuento o si el catálogo cambió, y no son lo mismo.
 *
 * Lo que se guarda aquí NO se recalcula nunca: si mañana la resina sube, este
 * renglón y su cotización siguen diciendo lo que se le prometió al paciente.
 */
export function TreatmentFields({
  patientId,
  toothCode,
  catalogo,
  canOverridePrice,
  findingEntryId,
  consultationId,
}: {
  patientId: string;
  toothCode?: string;
  catalogo: CatalogOption[];
  canOverridePrice: boolean;
  findingEntryId?: string;
  consultationId?: string;
}) {
  const [treatmentCode, setTreatmentCode] = useState(TREATMENTS[0].code);
  const [catalogItemId, setCatalogItemId] = useState("");
  const [precio, setPrecio] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [descuento, setDescuento] = useState("0");

  const producto = catalogo.find((c) => c.id === catalogItemId);
  const piezaCompleta = isWholeToothCode(treatmentCode);

  const total = lineTotal(Number(precio) || 0, Number(cantidad) || 1, Number(descuento) || 0);
  const fueraDeCatalogo = producto ? Number(precio) !== producto.price : false;

  return (
    <>
      <input type="hidden" name="patientId" value={patientId} />
      {toothCode && <input type="hidden" name="toothCode" value={toothCode} />}
      {findingEntryId && <input type="hidden" name="findingEntryId" value={findingEntryId} />}
      {consultationId && <input type="hidden" name="consultationId" value={consultationId} />}

      <div>
        <Label htmlFor="diagnosis">Diagnóstico</Label>
        <Input id="diagnosis" name="diagnosis" placeholder="Caries oclusal" />
      </div>

      <div>
        <Label htmlFor="treatmentCode">Tratamiento</Label>
        <Select
          id="treatmentCode"
          name="treatmentCode"
          value={treatmentCode}
          onChange={(e) => setTreatmentCode(e.target.value)}
        >
          {TREATMENTS.map((t) => (
            <option key={t.code} value={t.code}>
              {t.label}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="catalogItemId">Producto o servicio</Label>
        <Select
          id="catalogItemId"
          name="catalogItemId"
          value={catalogItemId}
          onChange={(e) => {
            const id = e.target.value;
            setCatalogItemId(id);
            const p = catalogo.find((c) => c.id === id);
            setPrecio(p ? String(p.price) : "");
          }}
        >
          <option value="">Sin producto del catálogo</option>
          {catalogo.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.categoryName ? ` · ${c.categoryName}` : ""} — {formatMoney(c.price)}
            </option>
          ))}
        </Select>
        {catalogo.length === 0 && (
          <p className="mt-1 text-xs text-amber-600">
            Todavía no hay productos en el catálogo del consultorio.
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="unitPrice">Precio unitario</Label>
        <Input
          id="unitPrice"
          name="unitPrice"
          inputMode="decimal"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          readOnly={!canOverridePrice && !!producto}
          className={!canOverridePrice && producto ? "bg-muted" : undefined}
        />
        {producto && (
          <p className="mt-1 text-xs text-muted-foreground">
            Catálogo: {formatMoney(producto.price)}
            {fueraDeCatalogo && canOverridePrice && " · se guardará el precio aplicado y el de lista"}
            {!canOverridePrice && " · tu rol no puede modificarlo"}
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="quantity">Cantidad</Label>
        <Input
          id="quantity"
          name="quantity"
          type="number"
          min={1}
          max={99}
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
        />
      </div>

      <div>
        <Label htmlFor="discount">Descuento (importe)</Label>
        <Input
          id="discount"
          name="discount"
          inputMode="decimal"
          value={descuento}
          onChange={(e) => setDescuento(e.target.value)}
        />
      </div>

      {toothCode && (
        <div className="md:col-span-2">
          <Label>Superficies</Label>
          {piezaCompleta ? (
            <p className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
              Este tratamiento aplica a la pieza completa.
            </p>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {SURFACES.map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="surfaces" value={s} className="h-4 w-4" />
                  {surfaceLabel(s, toothCode)}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="md:col-span-2">
        <Label htmlFor="notes">Notas</Label>
        <Textarea id="notes" name="notes" rows={2} />
      </div>

      <div className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm md:col-span-2">
        Importe de este renglón: <strong>{formatMoney(total)}</strong>
        <span className="ml-2 text-xs text-muted-foreground">
          Es una propuesta, no un cobro: agregarla al plan no registra ningún pago.
        </span>
      </div>
    </>
  );
}
