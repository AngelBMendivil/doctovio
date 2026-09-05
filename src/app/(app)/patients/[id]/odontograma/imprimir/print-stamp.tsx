"use client";

import { useEffect, useState } from "react";

/**
 * SELLO DEL MOMENTO EN QUE SE IMPRIME.
 *
 * No es la hora en que se abrió la pantalla: se vuelve a calcular justo antes
 * de imprimir (`beforeprint`). La diferencia importa — una hoja del odontograma
 * abierta desde la mañana y mandada a imprimir en la tarde diría una hora que
 * no es, y en un expediente clínico la hora de un documento es parte del
 * documento.
 *
 * Arranca vacío a propósito: el servidor no puede saber la hora local de quien
 * imprime, y renderizar una distinta a la del navegador rompe la hidratación.
 */
export function PrintStamp() {
  const [sello, setSello] = useState<string | null>(null);

  useEffect(() => {
    const marcar = () =>
      setSello(
        new Date().toLocaleString("es-MX", {
          dateStyle: "long",
          timeStyle: "short",
        })
      );

    marcar();
    window.addEventListener("beforeprint", marcar);
    return () => window.removeEventListener("beforeprint", marcar);
  }, []);

  // Reserva su espacio desde el primer render para que la hoja no salte.
  return <span className="tabular-nums">{sello ?? "—"}</span>;
}
