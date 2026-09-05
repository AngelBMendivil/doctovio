"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * QUÉ SE VE CUANDO ALGO FALLA.
 *
 * Hasta hoy no existía ninguna frontera de error en toda la aplicación: si una
 * pantalla o un server action lanzaba, Next mostraba su pantalla cruda de error
 * y la persona se quedaba sin barra lateral, sin botón para volver y sin idea
 * de qué pasó. En un consultorio, con el paciente enfrente, eso parece que el
 * sistema se cayó entero.
 *
 * Aquí el consultorio conserva su menú, puede reintentar sin perder la sesión y
 * —esto es lo importante para poder arreglarlo— ve el CÓDIGO del error. En
 * producción Next oculta el mensaje real por seguridad y solo deja ese código
 * (`digest`): es lo que hay que dictar por teléfono para encontrar el fallo en
 * la bitácora del servidor.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[app] error no controlado:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-12">
      <div className="rounded-xl border border-border bg-card p-8 text-center shadow-card">
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
          <AlertTriangle className="h-6 w-6 text-amber-600" />
        </span>

        <h1 className="text-lg font-semibold text-navy">Algo salió mal en esta pantalla</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No se perdió nada de lo que ya estaba guardado. Puedes reintentar; si vuelve a pasar, avísanos
          con el código de abajo.
        </p>

        {/* El mensaje solo se ve en desarrollo: en producción Next lo oculta y
            deja el digest, que es lo que sirve para encontrarlo en el log. */}
        {error.message && process.env.NODE_ENV !== "production" && (
          <p className="mt-3 rounded-md bg-muted px-3 py-2 text-left text-xs text-foreground">
            {error.message}
          </p>
        )}

        {error.digest && (
          <p className="mt-3 text-xs text-muted-foreground">
            Código del error: <span className="font-mono font-medium text-foreground">{error.digest}</span>
          </p>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button type="button" onClick={reset}>
            Reintentar
          </Button>
          <Link href="/dashboard">
            <Button type="button" variant="outline">
              Ir al inicio
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
