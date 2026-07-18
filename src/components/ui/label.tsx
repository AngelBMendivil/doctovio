import { cn } from "@/lib/utils/cn";
import type { LabelHTMLAttributes } from "react";

/** Etiqueta de campo. `required` pinta el asterisco en azul, sin escribirlo a mano. */
export function Label({
  className,
  required,
  children,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label className={cn("mb-1.5 block text-[13px] font-medium text-navy", className)} {...props}>
      {children}
      {required && <span className="ml-0.5 text-primary">*</span>}
    </label>
  );
}
