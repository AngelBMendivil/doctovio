"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type Tab = { id: string; label: string; content: ReactNode };

/**
 * Pestañas con la selección en la URL (?tab=dx), no en memoria.
 *
 * Es deliberado: al guardar algo, la acción hace `revalidatePath` y el árbol
 * se vuelve a renderizar. Con `useState` la pestaña se reiniciaba a la primera
 * y el usuario terminaba en otra pantalla creyendo que había perdido lo que
 * acababa de capturar. La URL sobrevive a la revalidación.
 *
 * De paso, la pestaña queda enlazable y el botón Atrás del navegador funciona.
 */
export function SettingsTabs({ tabs, paramName = "tab" }: { tabs: Tab[]; paramName?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const fromUrl = searchParams.get(paramName);
  const active = tabs.some((t) => t.id === fromUrl) ? fromUrl! : tabs[0]?.id;

  const select = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(paramName, id);
    // scroll: false para no saltar al inicio al cambiar de pestaña.
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => select(t.id)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              active === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tabs.map((t) => (
        <div key={t.id} hidden={t.id !== active}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
