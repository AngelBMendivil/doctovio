"use client";

import { useState, type ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

/**
 * Segundo factor del prerregistro.
 *
 * El enlace por sí solo abre un expediente clínico. Pedir la fecha de
 * nacimiento convierte el acceso en dos factores: algo que tienes (el enlace)
 * y algo que sabes (la fecha). Si alguien reenvía el enlace por error, quien
 * lo recibe no puede ver ni escribir nada.
 *
 * La comparación se hace aquí, en el navegador, contra un valor que el
 * servidor ya mandó. Es deliberado: no es un secreto —el consultorio ya
 * conoce esa fecha— y evita un viaje extra. Lo que protege de verdad es el
 * token, que sí es irrepetible y caduca el día de la consulta.
 */
export function BirthDateGate({
  expected,
  patientFirstName,
  children,
}: {
  /** Fecha de nacimiento del expediente, en formato YYYY-MM-DD. */
  expected: string;
  patientFirstName: string;
  children: ReactNode;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [tries, setTries] = useState(0);

  if (unlocked) return <>{children}</>;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value === expected) {
      setUnlocked(true);
      return;
    }
    const n = tries + 1;
    setTries(n);
    setError(
      n >= 3
        ? "La fecha no coincide. Comunícate con el consultorio para que verifiquen tus datos."
        : "La fecha no coincide con la que tenemos registrada. Inténtalo de nuevo."
    );
  };

  return (
    <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-6 shadow-card sm:p-8">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
        <ShieldCheck className="h-5 w-5 text-primary" />
      </div>

      <h1 className="text-xl font-semibold">Hola{patientFirstName ? `, ${patientFirstName}` : ""}</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Antes de continuar, confirma tu fecha de nacimiento. Es para asegurarnos de que estamos abriendo el
        expediente correcto.
      </p>

      <form onSubmit={submit} className="mt-5 space-y-4">
        {error && <Alert>{error}</Alert>}
        <div>
          <Label htmlFor="bd" required>Fecha de nacimiento</Label>
          <Input
            id="bd"
            type="date"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError("");
            }}
            required
          />
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={!value}>
          Continuar
        </Button>
      </form>
    </div>
  );
}
