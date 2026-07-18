"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  CalendarDays,
  Armchair,
  Stethoscope,
  ClipboardList,
  Wallet,
  MessageSquare,
  BarChart3,
  Share2,
  ShieldCheck,
  Settings,
  LogOut,
} from "lucide-react";
import { logoutAction } from "@/lib/actions/auth";
import { LogoHorizontal, Isotipo } from "@/components/brand/logo";
import type { SessionPayload } from "@/lib/auth/session";
import { cn } from "@/lib/utils/cn";

type Item = { href: string; label: string; icon: typeof LayoutDashboard; roles: string[] };
const ALL = ["ADMIN", "DOCTOR", "ASSISTANT"];

const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Operación",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ALL },
      { href: "/appointments", label: "Agenda", icon: CalendarDays, roles: ALL },
      { href: "/waiting-room", label: "Sala de espera", icon: Armchair, roles: ALL },
      { href: "/whatsapp", label: "Asistente", icon: MessageSquare, roles: ALL },
      { href: "/consultations", label: "Consultas", icon: ClipboardList, roles: ["ADMIN", "DOCTOR"] },
      { href: "/payments", label: "Por pagar", icon: Wallet, roles: ALL },
    ],
  },
  {
    label: "Pacientes",
    items: [
      { href: "/patients", label: "Pacientes", icon: Users, roles: ALL },
      { href: "/preregistrations", label: "Prerregistros", icon: UserPlus, roles: ALL },
      { href: "/referrals", label: "Referencias", icon: Share2, roles: ["ADMIN", "DOCTOR"] },
    ],
  },
  {
    label: "Administración",
    items: [
      { href: "/finance", label: "Finanzas", icon: BarChart3, roles: ["ADMIN"] },
      { href: "/directory", label: "Directorio médico", icon: Stethoscope, roles: ALL },
      { href: "/insurers", label: "Aseguradoras", icon: ShieldCheck, roles: ["ADMIN"] },
      { href: "/settings", label: "Configuración", icon: Settings, roles: ["ADMIN"] },
    ],
  },
];

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrador",
  DOCTOR: "Médico",
  ASSISTANT: "Asistente",
};

export function Sidebar({
  session,
  collapsed = false,
  onNavigate,
}: {
  session: SessionPayload;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    // El fondo va por variable CSS (no por clase del tema) para que la barra
    // nunca quede en blanco si Tailwind no recompila la configuración.
    <div className="flex h-full flex-col text-white" style={{ backgroundColor: "var(--doctovio-navy)" }}>
      {/* Logotipo — con aire suficiente alrededor */}
      <div className={cn("flex items-center px-5 pb-4 pt-5", collapsed && "justify-center px-0")}>
        <Link href="/dashboard" onClick={onNavigate} aria-label="Doctovio — Inicio">
          {collapsed ? <Isotipo className="h-9 w-9" /> : <LogoHorizontal variant="blanco" className="h-11" />}
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-2">
        {GROUPS.map((g) => {
          const items = g.items.filter((i) => i.roles.includes(session.role));
          if (items.length === 0) return null;
          return (
            <div key={g.label} className="mt-4 first:mt-1">
              {collapsed ? (
                <div className="mx-2 mb-2 h-px bg-white/10" />
              ) : (
                <p className="px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-white/40">
                  {g.label}
                </p>
              )}
              {items.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "group relative mb-0.5 flex items-center rounded-lg text-[13.5px] font-medium transition-colors",
                      collapsed ? "h-11 justify-center" : "gap-3 px-3 py-2.5",
                      active ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent" />
                    )}
                    <Icon className={cn("h-[18px] w-[18px] shrink-0", active && "text-accent")} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Usuario + salir */}
      <div className="border-t border-white/10 p-3">
        {!collapsed && (
          <div className="mb-1 px-2 py-1.5">
            <p className="truncate text-[13px] font-semibold text-white">{session.fullName}</p>
            <p className="truncate text-[11px] text-white/50">{ROLE_LABEL[session.role] ?? session.role}</p>
          </div>
        )}
        <form action={logoutAction}>
          <button
            type="submit"
            title={collapsed ? "Cerrar sesión" : undefined}
            className={cn(
              "flex w-full items-center rounded-lg text-[13px] text-white/60 transition-colors hover:bg-white/5 hover:text-white",
              collapsed ? "h-11 justify-center" : "gap-3 px-3 py-2.5"
            )}
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && "Cerrar sesión"}
          </button>
        </form>
      </div>
    </div>
  );
}
