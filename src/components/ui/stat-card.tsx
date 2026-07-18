import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Tarjeta de métrica del dashboard: dato grande, icono con fondo suave y
 * una nota discreta. Si recibe `href` toda la tarjeta es clicable.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "blue",
  href,
  emphasis = false,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  /** blue = operación · teal = clínico/positivo · gray = informativo */
  tone?: "blue" | "teal" | "gray";
  href?: string;
  /** Resalta la tarjeta cuando el dato exige acción. */
  emphasis?: boolean;
}) {
  const toneClasses = {
    blue: "bg-primary/10 text-primary",
    teal: "bg-accent/10 text-accent",
    gray: "bg-muted text-muted-foreground",
  }[tone];

  const body = (
    <div
      className={cn(
        "h-full rounded-xl border bg-card p-5 shadow-card transition-shadow",
        emphasis ? "border-accent/40" : "border-border",
        href && "hover:shadow-card-hover"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", toneClasses)}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <p className="mt-2 text-3xl font-bold tracking-tight text-navy">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}
