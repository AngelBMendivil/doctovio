import { cn } from "@/lib/utils/cn";
import type { InputHTMLAttributes } from "react";

/** Campo de texto: 44px de alto, fondo blanco, foco azul. `error` lo marca en rojo. */
export function Input({
  className,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { error?: boolean }) {
  return (
    <input
      aria-invalid={error || undefined}
      className={cn(
        "flex h-11 w-full rounded-lg border bg-card px-3 py-2 text-sm text-foreground transition-colors",
        "placeholder:text-muted-foreground/70",
        "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30",
        "disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground",
        error ? "border-destructive focus:border-destructive focus:ring-destructive/25" : "border-border",
        className
      )}
      {...props}
    />
  );
}
