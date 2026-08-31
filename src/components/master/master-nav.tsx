"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Building2, Users, Wallet, Package, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const ITEMS = [
  { href: "/master", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/master/consultorios", label: "Consultorios", icon: Building2 },
  { href: "/master/usuarios", label: "Usuarios", icon: Users },
  { href: "/master/cobranza", label: "Cobranza", icon: Wallet },
  { href: "/master/productos", label: "Productos", icon: Package },
  { href: "/master/auditoria", label: "Auditoría", icon: ScrollText },
];

export function MasterNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:pb-0">
      {ITEMS.map(({ href, label, icon: Icon, exact }) => {
        // El Dashboard vive en la raíz: sin `exact` quedaría marcado en todas
        // las secciones, porque todas empiezan con /master.
        const active = exact ? pathname === href : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
              active ? "bg-white/15 font-medium text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
