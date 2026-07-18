import { cn } from "@/lib/utils/cn";
import type { TextareaHTMLAttributes } from "react";

export function Textarea({
  className,
  error,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }) {
  return (
    <textarea
      aria-invalid={error || undefined}
      className={cn(
        "flex min-h-[90px] w-full rounded-lg border bg-card px-3 py-2 text-sm text-foreground transition-colors",
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
