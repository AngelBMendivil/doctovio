"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createPatientAction, type ActionState } from "@/lib/actions/patients";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";

const initialState: ActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Guardando..." : "Guardar paciente"}
    </Button>
  );
}

export default function NewPatientPage() {
  const [state, formAction] = useFormState(createPatientAction, initialState);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Nuevo paciente</h1>
      <p className="text-sm text-muted-foreground">
        Antes de guardar, verifica que no exista ya un expediente similar (nombre, teléfono, correo o CURP).
      </p>

      {state?.error && <Alert>{state.error}</Alert>}

      <form action={formAction} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Datos generales</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <Label htmlFor="firstName">Nombre(s)</Label>
              <Input id="firstName" name="firstName" required />
            </div>
            <div>
              <Label htmlFor="lastName1">Primer apellido</Label>
              <Input id="lastName1" name="lastName1" required />
            </div>
            <div>
              <Label htmlFor="lastName2">Segundo apellido</Label>
              <Input id="lastName2" name="lastName2" />
            </div>
            <div>
              <Label htmlFor="birthDate">Fecha de nacimiento</Label>
              <Input id="birthDate" name="birthDate" type="date" required />
            </div>
            <div>
              <Label htmlFor="sex">Sexo</Label>
              <Select id="sex" name="sex" required defaultValue="UNDETERMINED">
                <option value="MALE">Masculino</option>
                <option value="FEMALE">Femenino</option>
                <option value="UNDETERMINED">No especificado</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="gender">Género (opcional)</Label>
              <Input id="gender" name="gender" />
            </div>
            <div>
              <Label htmlFor="curp">CURP (opcional)</Label>
              <Input id="curp" name="curp" maxLength={18} />
            </div>
            <div>
              <Label htmlFor="phone">Teléfono</Label>
              <Input id="phone" name="phone" />
            </div>
            <div>
              <Label htmlFor="email">Correo</Label>
              <Input id="email" name="email" type="email" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Dirección y datos adicionales</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <Label htmlFor="address">Dirección</Label>
              <Input id="address" name="address" />
            </div>
            <div>
              <Label htmlFor="city">Ciudad</Label>
              <Input id="city" name="city" />
            </div>
            <div>
              <Label htmlFor="state">Estado</Label>
              <Input id="state" name="state" />
            </div>
            <div>
              <Label htmlFor="postalCode">Código postal</Label>
              <Input id="postalCode" name="postalCode" />
            </div>
            <div>
              <Label htmlFor="country">País</Label>
              <Input id="country" name="country" defaultValue="MX" />
            </div>
            <div>
              <Label htmlFor="occupation">Ocupación</Label>
              <Input id="occupation" name="occupation" />
            </div>
            <div>
              <Label htmlFor="maritalStatus">Estado civil</Label>
              <Select id="maritalStatus" name="maritalStatus" defaultValue="">
                <option value="">No especificado</option>
                <option value="SINGLE">Soltero(a)</option>
                <option value="MARRIED">Casado(a)</option>
                <option value="DIVORCED">Divorciado(a)</option>
                <option value="WIDOWED">Viudo(a)</option>
                <option value="FREE_UNION">Unión libre</option>
                <option value="OTHER">Otro</option>
              </Select>
            </div>
            <div className="md:col-span-3">
              <Label htmlFor="adminNotes">Observaciones administrativas</Label>
              <Textarea id="adminNotes" name="adminNotes" />
            </div>
          </CardContent>
        </Card>

        <SubmitButton />
      </form>
    </div>
  );
}
