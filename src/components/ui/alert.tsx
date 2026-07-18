import { cn } from "@/lib/utils/cn";
import type { HTMLAttributes } from "react";

/** Aviso en línea. Por defecto error; `tone` cubre los demás estados. */
type Tone = "error" | "success" | "info";

const toneClasses: Record<Tone, string> = {
  error: "border-destructive/30 bg-destructive/5 text-destructive",
  success: "border-accent/30 bg-accent/5 text-accent",
  info: "border-primary/30 bg-primary/5 text-primary",
};

export function Alert({
  className,
  tone = "error",
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: Tone }) {
  return (
    <div
      role="alert"
      className={cn("rounded-lg border px-4 py-3 text-sm", toneClasses[tone], className)}
      {...props}
    />
  );
}
