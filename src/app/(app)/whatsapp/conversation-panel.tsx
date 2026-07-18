"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Bot, Send, ArrowLeft, Check, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import {
  replyAsHumanAction,
  returnToBotAction,
  resolveConversationAction,
  simulateIncomingAction,
  type ActionState,
} from "@/lib/actions/conversation";

type Msg = { id: string; direction: string; body: string; options: string[]; createdAt: string };

/**
 * Botón que se apaga y cambia de texto mientras la acción corre.
 * Sin esto el usuario presiona, no ve nada y vuelve a presionar.
 */
function Submit({
  label,
  pendingLabel,
  variant = "primary",
  icon,
}: {
  label: string;
  pendingLabel: string;
  variant?: "primary" | "outline" | "ghost";
  icon?: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {icon}
      {pending ? pendingLabel : label}
    </Button>
  );
}

/** Confirmación o error de la última acción. Verde = pasó; rojo = no pasó. */
function Feedback({ state }: { state: ActionState }) {
  if (!state) return null;
  if (!state.ok) return <Alert>{state.message}</Alert>;
  return (
    <p className="flex items-center gap-1.5 text-sm font-medium text-accent">
      <CheckCircle2 className="h-4 w-4" />
      {state.message}
    </p>
  );
}

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

export function ConversationPanel({
  sessionId,
  phone,
  phoneMasked,
  patientName,
  status,
  messages,
}: {
  sessionId: string;
  /** Teléfono completo: se usa para seguir simulando al paciente. */
  phone: string;
  phoneMasked: string;
  patientName: string | null;
  status: string;
  messages: Msg[];
}) {
  const [humanState, humanAction] = useFormState(replyAsHumanAction, null as ActionState);
  const [patientState, patientAction] = useFormState(simulateIncomingAction, null as ActionState);
  const [botState, botAction] = useFormState(returnToBotAction, null as ActionState);
  const [resolveState, resolveAction] = useFormState(resolveConversationAction, null as ActionState);

  const humanForm = useRef<HTMLFormElement>(null);
  const patientForm = useRef<HTMLFormElement>(null);

  // Al enviar bien, se limpia la caja: si el texto se queda, parece que no se mandó.
  useEffect(() => {
    if (humanState?.ok) humanForm.current?.reset();
  }, [humanState]);
  useEffect(() => {
    if (patientState?.ok) patientForm.current?.reset();
  }, [patientState]);

  const needsHuman = status === "NEEDS_HUMAN";

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="truncate">{patientName ?? phoneMasked}</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {patientName ? phoneMasked : "Sin expediente ligado"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {needsHuman && <Badge tone="warning">Requiere intervención</Badge>}
          {status === "RESOLVED" && <Badge tone="success">Resuelta</Badge>}
          <Link href="/whatsapp">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Simulador
            </Button>
          </Link>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Hilo */}
        <div className="max-h-[440px] space-y-3 overflow-y-auto rounded-lg bg-background p-4">
          {messages.length === 0 && <p className="text-center text-sm text-muted-foreground">Sin mensajes.</p>}
          {messages.map((m) => {
            const incoming = m.direction === "IN";
            return (
              <div key={m.id} className={`flex ${incoming ? "justify-start" : "justify-end"}`}>
                <div
                  className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm shadow-card ${
                    incoming ? "bg-card text-foreground" : "bg-accent/10 text-navy"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  {m.options.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border pt-2">
                      {m.options.map((o, i) => (
                        <span
                          key={i}
                          className="rounded-full bg-card px-2 py-0.5 text-[11px] text-muted-foreground ring-1 ring-inset ring-border"
                        >
                          {i + 1}. {o}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="mt-1 text-right text-[10px] text-muted-foreground">{hhmm(m.createdAt)}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Seguir simulando como paciente */}
        <div className="space-y-2">
          <form ref={patientForm} action={patientAction} className="flex gap-2">
            <input type="hidden" name="phone" value={phone} />
            <Input name="body" placeholder="Responder como el paciente (simulador)…" autoComplete="off" />
            <Submit label="Enviar" pendingLabel="Enviando..." icon={<Send className="h-4 w-4" />} />
          </form>
          <Feedback state={patientState} />
        </div>

        {/* Intervención del consultorio */}
        <div className="space-y-2 rounded-lg border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-navy">Responder como consultorio</p>
            <div className="flex gap-2">
              <form action={botAction}>
                <input type="hidden" name="sessionId" value={sessionId} />
                <Submit
                  label="Devolver al asistente"
                  pendingLabel="Devolviendo..."
                  variant="ghost"
                  icon={<Bot className="h-4 w-4" />}
                />
              </form>
              <form action={resolveAction}>
                <input type="hidden" name="sessionId" value={sessionId} />
                <Submit
                  label="Marcar resuelta"
                  pendingLabel="Guardando..."
                  variant="outline"
                  icon={<Check className="h-4 w-4" />}
                />
              </form>
            </div>
          </div>

          <Feedback state={botState} />
          <Feedback state={resolveState} />

          <form ref={humanForm} action={humanAction} className="flex gap-2">
            <input type="hidden" name="sessionId" value={sessionId} />
            <Input name="body" placeholder="Escribe un mensaje al paciente…" autoComplete="off" />
            <Submit label="Enviar" pendingLabel="Enviando..." icon={<Send className="h-4 w-4" />} />
          </form>
          <Feedback state={humanState} />

          <p className="text-xs text-muted-foreground">
            Mientras la conversación esté con una persona, el asistente no responde.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
