import { cn } from "@/lib/utils/cn";
import type { ButtonHTMLAttributes } from "react";

/**
 * Botones Doctovio.
 *   primary     azul — la acción principal de la pantalla (idealmente una por vista)
 *   success     turquesa — confirmaciones y acciones positivas (cobrar, confirmar)
 *   secondary   blanco con borde azul — acción alterna
 *   outline     blanco con borde neutro — acción terciaria
 *   ghost       sin fondo — acciones dentro de tablas y listas
 *   destructive rojo — solo eliminar / cancelar
 */
type Variant = "primary" | "success" | "secondary" | "outline" | "ghost" | "destructive";
type Size = "sm" | "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
  success: "bg-accent text-accent-foreground shadow-sm hover:bg-accent/90",
  secondary: "border border-primary/30 bg-card text-primary hover:border-primary/50 hover:bg-primary/5",
  outline: "border border-border bg-card text-foreground hover:bg-muted",
  ghost: "bg-transparent text-foreground hover:bg-muted",
  destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-9 px-3 text-[13px]",
  md: "h-11 px-4 text-sm", // 44px: cómodo al tacto
  lg: "h-12 px-6 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition-colors",
        "disabled:pointer-events-none disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  );
}
