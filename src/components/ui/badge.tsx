import { cn } from "@/lib/utils/cn";
import type { HTMLAttributes } from "react";

/**
 * Etiquetas de estado Doctovio. Colores desaturados para que la tabla respire.
 *   success  turquesa — confirmado, atendido, pagado
 *   info     azul     — completado, informativo
 *   soft     aqua     — en sala de espera, en curso
 *   warning  ámbar    — pendiente, por confirmar
 *   danger   rojo     — cancelado, no asistió
 *   default  gris     — inactivo
 */
type Tone = "default" | "success" | "warning" | "danger" | "info" | "soft";

const toneClasses: Record<Tone, string> = {
  default: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
  success: "bg-accent/10 text-accent ring-1 ring-inset ring-accent/20",
  warning: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
  danger: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200",
  info: "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20",
  soft: "bg-accent-soft/40 text-navy ring-1 ring-inset ring-accent-soft",
};

export function Badge({ tone = "default", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        toneClasses[tone],
        className
      )}
      {...props}
    />
  );
}
