"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Send, RotateCcw, Smartphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { simulateIncomingAction, resetSimulatorAction, type ActionState } from "@/lib/actions/conversation";

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-label="Enviar">
      <Send className="h-4 w-4" />
      {pending ? "Enviando..." : "Enviar"}
    </Button>
  );
}

/**
 * Simulador: escribe como si fueras el paciente. El mensaje recorre el mismo
 * orquestador y motor de agenda que usará WhatsApp — las citas que se creen
 * aquí son citas reales en Doctovio.
 */
export function Simulator({ phone }: { phone: string }) {
  const [state, formAction] = useFormState(simulateIncomingAction, null as ActionState);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Simulador del paciente</CardTitle>
        <form action={resetSimulatorAction}>
          <input type="hidden" name="phone" value={phone} />
          <Button type="submit" variant="ghost" size="sm">
            <RotateCcw className="h-4 w-4" />
            Reiniciar conversación
          </Button>
        </form>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
          Las citas que agendes aquí se crean de verdad en la agenda. Para probar, escribe <b>hola</b> y sigue el
          menú respondiendo con el número de la opción.
        </div>

        <form action={formAction} className="space-y-3">
          <div>
            <Label htmlFor="phone">Teléfono del paciente que simulas</Label>
            <div className="relative">
              <Smartphone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="phone" name="phone" defaultValue={phone} className="pl-9" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Si coincide con el teléfono de un expediente, el asistente reconoce al paciente.
            </p>
          </div>

          <div>
            <Label htmlFor="body">Mensaje</Label>
            <div className="flex gap-2">
              <Input id="body" name="body" placeholder="hola" autoComplete="off" />
              <SendButton />
            </div>
          </div>

          {state && !state.ok && <p className="text-sm text-red-700">{state.message}</p>}
        </form>

        <p className="text-xs text-muted-foreground">
          Después de enviar, abre la conversación en la bandeja de la derecha para ver el hilo completo.
        </p>
      </CardContent>
    </Card>
  );
}
