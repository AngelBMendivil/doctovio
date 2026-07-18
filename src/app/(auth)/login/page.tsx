"use client";

import { useFormState, useFormStatus } from "react-dom";
import { ShieldCheck } from "lucide-react";
import { loginAction, type LoginState } from "@/lib/actions/auth";
import { LogoHorizontal, TAGLINE } from "@/components/brand/logo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

const initialState: LoginState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Ingresando..." : "Iniciar sesión"}
    </Button>
  );
}

/**
 * Curvas abstractas inspiradas en el trazo del isotipo. Puramente decorativas:
 * dan identidad sin recurrir a fotos genéricas de médicos.
 */
function FlowBackdrop() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 600 800"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
    >
      <path d="M-50 620C120 560 180 420 140 300 100 180 160 60 320 10" stroke="#14B8A6" strokeOpacity="0.25" strokeWidth="1.5" />
      <path d="M60 800C240 700 300 540 250 400 200 260 280 120 460 60" stroke="#A6E7E1" strokeOpacity="0.35" strokeWidth="1.5" />
      <path d="M180 820C380 720 440 540 380 380 320 220 420 80 620 30" stroke="#14B8A6" strokeOpacity="0.18" strokeWidth="1.5" />
      <circle cx="470" cy="140" r="120" fill="#14B8A6" fillOpacity="0.07" />
      <circle cx="120" cy="640" r="160" fill="#A6E7E1" fillOpacity="0.09" />
    </svg>
  );
}

export default function LoginPage() {
  const [state, formAction] = useFormState(loginAction, initialState);

  return (
    <main className="flex min-h-screen">
      {/* Panel de marca — solo en pantallas grandes */}
      <div className="relative hidden w-1/2 overflow-hidden bg-navy lg:flex lg:flex-col lg:justify-between lg:p-12">
        <FlowBackdrop />
        {/* self-start evita que el flex estire el SVG a lo ancho del panel */}
        <LogoHorizontal variant="blanco" className="relative h-24 self-start" />
        <div className="relative max-w-md">
          <p className="text-3xl font-bold leading-tight text-white">
            Gestión médica <span className="text-accent">que fluye</span>
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-white/60">
            Agenda, expedientes, recetas y cobros en un solo lugar. Menos administración, más tiempo con tus pacientes.
          </p>
        </div>
        <p className="relative flex items-center gap-2 text-xs text-white/40">
          <ShieldCheck className="h-4 w-4" />
          Información clínica protegida y auditable.
        </p>
      </div>

      {/* Formulario */}
      <div className="doctovio-flow flex w-full items-center justify-center bg-background px-4 py-10 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <LogoHorizontal className="h-16" />
          </div>

          <h1 className="text-2xl font-bold tracking-tight">Iniciar sesión</h1>
          <p className="mt-1.5 text-sm text-muted-foreground lg:hidden">{TAGLINE}</p>
          <p className="mt-1.5 hidden text-sm text-muted-foreground lg:block">
            Ingresa con tu correo y contraseña.
          </p>

          <div className="mt-7 rounded-xl border border-border bg-card p-6 shadow-card sm:p-7">
            <form action={formAction} className="space-y-5">
              {state?.error && <Alert>{state.error}</Alert>}

              <div>
                <Label htmlFor="email" required>
                  Correo electrónico
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="doctor@consultorio.com"
                  error={!!state?.error}
                  required
                />
              </div>

              <div>
                <div className="flex items-baseline justify-between">
                  <Label htmlFor="password" required>
                    Contraseña
                  </Label>
                  <a href="mailto:soporte@doctovio.com?subject=Recuperar%20contrase%C3%B1a" className="mb-1.5 text-xs font-medium text-primary hover:underline">
                    ¿Olvidaste tu contraseña?
                  </a>
                </div>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  error={!!state?.error}
                  required
                />
              </div>

              <SubmitButton />
            </form>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Doctovio · {TAGLINE}
          </p>
        </div>
      </div>
    </main>
  );
}
