"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu, X, PanelLeftClose, PanelLeft, Bell, ChevronDown, Settings, LogOut } from "lucide-react";
import { Sidebar } from "./sidebar";
import { LogoHorizontal } from "@/components/brand/logo";
import { logoutAction } from "@/lib/actions/auth";
import type { SessionPayload } from "@/lib/auth/session";
import { cn } from "@/lib/utils/cn";

const COLLAPSE_KEY = "doctovio:sidebar-collapsed";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrador",
  DOCTOR: "Médico",
  ASSISTANT: "Asistente",
};

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** Menú de perfil: se cierra al hacer clic fuera o con Escape. */
function ProfileMenu({ session, initials }: { session: SessionPayload; initials: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2.5 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-muted"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-[12px] font-bold text-primary">
          {initials}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-[13px] font-semibold text-navy">{session.fullName}</span>
          <span className="block text-[11px] text-muted-foreground">{ROLE_LABEL[session.role] ?? session.role}</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-60 animate-fade-in overflow-hidden rounded-xl border border-border bg-card shadow-popover"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-semibold text-navy">{session.fullName}</p>
            <p className="truncate text-xs text-muted-foreground">{session.email}</p>
          </div>
          {session.role === "ADMIN" && (
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted"
            >
              <Settings className="h-4 w-4 text-muted-foreground" />
              Configuración
            </Link>
          )}
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted"
            >
              <LogOut className="h-4 w-4 text-muted-foreground" />
              Cerrar sesión
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export function AppShell({
  session,
  pendingConversations = 0,
  children,
}: {
  session: SessionPayload;
  /** Conversaciones de WhatsApp esperando a una persona. */
  pendingConversations?: number;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const initials = initialsOf(session.fullName);

  // La preferencia de colapso se lee tras montar para no romper la hidratación.
  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      window.localStorage.setItem(COLLAPSE_KEY, v ? "0" : "1");
      return !v;
    });
  };

  return (
    <div className="flex min-h-screen bg-background print:block print:min-h-0 print:bg-white">
      {/* Barra lateral — escritorio */}
      <aside
        className={cn(
          "hidden shrink-0 transition-[width] duration-200 md:block print:hidden",
          collapsed ? "w-[76px]" : "w-64"
        )}
      >
        <div className="sticky top-0 h-screen">
          <Sidebar session={session} collapsed={collapsed} />
        </div>
      </aside>

      {/* Barra lateral — móvil */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-navy/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-64 shadow-popover">
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Cerrar menú"
              className="absolute right-2 top-4 z-10 rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
            <Sidebar session={session} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Encabezado: ligero, no compite con el contenido */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-card/90 px-4 backdrop-blur-md print:hidden">
          <button
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-navy md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>

          <button
            className="hidden rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-navy md:block"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
          >
            {collapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </button>

          {/* En móvil la marca vive aquí, porque la barra lateral está oculta */}
          <Link href="/dashboard" className="md:hidden" aria-label="Doctovio — Inicio">
            <LogoHorizontal className="h-8" />
          </Link>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            {/* La campana lleva a lo único que hoy exige atención humana:
                conversaciones escaladas. Un paciente esperando sin que nadie
                lo sepa es el peor fallo de este canal. */}
            <Link
              href="/whatsapp?b=ayuda"
              className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-navy"
              aria-label={
                pendingConversations > 0
                  ? `${pendingConversations} conversaciones requieren atención`
                  : "Notificaciones"
              }
            >
              <Bell className="h-5 w-5" />
              {pendingConversations > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                  {pendingConversations > 9 ? "9+" : pendingConversations}
                </span>
              )}
            </Link>
            <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
            <ProfileMenu session={session} initials={initials} />
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 print:overflow-visible print:p-0">{children}</main>
      </div>
    </div>
  );
}
