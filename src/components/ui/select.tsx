import { cn } from "@/lib/utils/cn";
import type { SelectHTMLAttributes } from "react";

/** Desplegable nativo, alineado al alto y foco de Input. */
export function Select({
  className,
  error,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean }) {
  return (
    <select
      aria-invalid={error || undefined}
      className={cn(
        "flex h-11 w-full rounded-lg border bg-card px-3 py-2 text-sm text-foreground transition-colors",
        "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30",
        "disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground",
        error ? "border-destructive focus:border-destructive focus:ring-destructive/25" : "border-border",
        className
      )}
      {...props}
    />
  );
}
