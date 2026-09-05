"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { Search, X } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

/**
 * Filtros del catálogo de Productos y Servicios.
 *
 * Mismo criterio que en el listado de usuarios del panel Master: desplegables
 * en vez de pastillas, porque un consultorio con treinta servicios y doce
 * categorías no cabe en una fila de botones.
 *
 * Estos `select` NAVEGAN, no mutan. Un desplegable que guarda al soltarlo
 * convierte un roce de la rueda del mouse en un cambio de precio.
 */

type Opcion = { id: string; name: string };

export function ProductFilters({ categorias }: { categorias: Opcion[] }) {
  const router = useRouter();
  const params = useSearchParams();

  const [texto, setTexto] = useState(params.get("q") ?? "");

  useEffect(() => {
    const actual = params.get("q") ?? "";
    if (texto === actual) return;
    const t = setTimeout(() => aplicar("q", texto), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  function aplicar(clave: string, valor: string) {
    const next = new URLSearchParams(params.toString());
    if (valor) next.set(clave, valor);
    else next.delete(clave);
    router.push(`/products?${next.toString()}`);
  }

  const hayFiltros = ["categoria", "tipo", "estado", "q"].some((k) => params.get(k));

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-[220px] flex-1 space-y-1.5">
        <label htmlFor="q" className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Buscar
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="q"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Nombre, código o descripción"
            className="pl-9"
          />
        </div>
      </div>

      <div className="w-[200px] space-y-1.5">
        <label htmlFor="f-categoria" className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Categoría
        </label>
        <Select
          id="f-categoria"
          value={params.get("categoria") ?? ""}
          onChange={(e) => aplicar("categoria", e.target.value)}
        >
          <option value="">Todas</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="w-[160px] space-y-1.5">
        <label htmlFor="f-tipo" className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Tipo
        </label>
        <Select id="f-tipo" value={params.get("tipo") ?? ""} onChange={(e) => aplicar("tipo", e.target.value)}>
          <option value="">Todos</option>
          <option value="SERVICE">Servicio</option>
          <option value="PRODUCT">Producto</option>
        </Select>
      </div>

      <div className="w-[150px] space-y-1.5">
        <label htmlFor="f-estado" className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Estado
        </label>
        <Select id="f-estado" value={params.get("estado") ?? ""} onChange={(e) => aplicar("estado", e.target.value)}>
          <option value="">Todos</option>
          <option value="activos">Activos</option>
          <option value="inactivos">Inactivos</option>
        </Select>
      </div>

      {hayFiltros && (
        <button
          type="button"
          onClick={() => {
            setTexto("");
            router.push("/products");
          }}
          className="flex h-11 items-center gap-1.5 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:text-destructive"
        >
          <X className="h-4 w-4" aria-hidden />
          Limpiar
        </button>
      )}
    </div>
  );
}
