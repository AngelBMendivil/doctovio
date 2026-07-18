"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

/**
 * Refresco automático de una pantalla operativa.
 *
 * Vuelve a pedir los datos al servidor cada cierto tiempo, para que una
 * bandeja abierta todo el día no se quede congelada. Refresca también el
 * encabezado, así que el contador de la campana se mantiene al día.
 *
 * Dos cosas que NO hace, a propósito:
 *
 *   · No refresca si la pestaña está en segundo plano. Nadie la está viendo y
 *     solo gastaría base de datos.
 *   · No refresca mientras alguien escribe en un campo. Un refresco a media
 *     captura puede tirar lo que el usuario lleva escrito, y perder datos es
 *     mucho peor que ver información con 20 segundos de retraso.
 */
export function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  const [lastAt, setLastAt] = useState<Date | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return;

      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;

      if (typing) {
        setPaused(true);
        return;
      }

      setPaused(false);
      router.refresh();
      setLastAt(new Date());
    }, seconds * 1000);

    return () => clearInterval(id);
  }, [router, seconds]);

  return (
    <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <RefreshCw className="h-3 w-3" />
      {paused
        ? "Pausado mientras escribes"
        : lastAt
          ? `Actualizado ${lastAt.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`
          : `Se actualiza solo cada ${seconds} s`}
    </p>
  );
}
