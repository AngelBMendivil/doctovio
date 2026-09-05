"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { Search, X } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

/**
 * Filtros del listado de usuarios.
 *
 * Van como desplegables y no como pastillas: con 40 consultorios, una pastilla
 * por cada uno es una fila que no cabe en pantalla.
 *
 * Un `select` que NAVEGA al cambiar está bien — es una lectura, y se deshace
 * volviendo atrás. Lo que no puede hacerse así es MUTAR: en este mismo listado
 * había un desplegable de rol que guardaba al cambiar, y rozar la rueda del
 * mouse sobre él reasignaba el rol de alguien sin confirmación.
 *
 * El estado vive en la URL, no en `useState`: así el filtro sobrevive a un
 * refresco y se puede compartir el enlace ya filtrado.
 */

type Opcion = { id: string; name: string };

export function UserFilters({ clinics }: { clinics: Opcion[] }) {
  const router = useRouter();
  const params = useSearchParams();

  const [texto, setTexto] = useState(params.get("q") ?? "");

  // La búsqueda navega sola tras una pausa, para no disparar una consulta por
  // cada tecla. Se compara contra la URL para no reescribir el historial
  // cuando el valor no cambió.
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
    router.push(`/master/usuarios?${next.toString()}`);
  }

  const hayFiltros = ["consultorio", "rol", "estado", "q"].some((k) => params.get(k));

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-[220px] flex-1 space-y-1.5">
        <label htmlFor="q" className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Buscar
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            id="q"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Nombre, correo o alias"
            className="pl-9"
          />
        </div>
      </div>

      <div className="w-[210px] space-y-1.5">
        <label htmlFor="f-consultorio" className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Consultorio
        </label>
        <Select
          id="f-consultorio"
          value={params.get("consultorio") ?? ""}
          onChange={(e) => aplicar("consultorio", e.target.value)}
        >
          <option value="">Todos</option>
          {clinics.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </div>

      <div className="w-[170px] space-y-1.5">
        <label htmlFor="f-rol" className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Rol
        </label>
        <Select id="f-rol" value={params.get("rol") ?? ""} onChange={(e) => aplicar("rol", e.target.value)}>
          <option value="">Todos</option>
          <option value="DOCTOR">Doctor</option>
          <option value="ADMIN">Administrativo</option>
          <option value="ASSISTANT">Secretaria</option>
        </Select>
      </div>

      <div className="w-[150px] space-y-1.5">
        <label htmlFor="f-estado" className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Estado
        </label>
        <Select id="f-estado" value={params.get("estado") ?? ""} onChange={(e) => aplicar("estado", e.target.value)}>
          <option value="">Todos</option>
          <option value="activo">Activos</option>
          <option value="inactivo">Inactivos</option>
        </Select>
      </div>

      {hayFiltros && (
        <button
          type="button"
          onClick={() => { setTexto(""); router.push("/master/usuarios"); }}
          className="flex h-11 items-center gap-1.5 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:text-destructive"
        >
          <X className="h-4 w-4" aria-hidden />
          Limpiar
        </button>
      )}
    </div>
  );
}
