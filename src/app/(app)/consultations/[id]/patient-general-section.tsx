"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { updatePatientGeneralAction } from "@/lib/actions/patients";

const SEX: Record<string, string> = { MALE: "Masculino", FEMALE: "Femenino", UNDETERMINED: "Sin especificar" };
const MARITAL: Record<string, string> = {
  SINGLE: "Soltero(a)", MARRIED: "Casado(a)", DIVORCED: "Divorciado(a)",
  WIDOWED: "Viudo(a)", FREE_UNION: "Unión libre", OTHER: "Otro",
};

export type PatientData = {
  patientId: string;
  recordNumber: string;
  firstName: string;
  lastName1: string;
  lastName2: string;
  birthDate: string;
  age: number;
  sex: string;
  phone: string;
  email: string;
  maritalStatus: string;
  occupation: string;
  address: string;
  city: string;
  state: string;
  bloodType: string;
  curp: string;
  allergiesText: string;
  chronicText: string;
  medsText: string;
};

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value && String(value).trim() ? value : "—"}</p>
    </div>
  );
}

/**
 * Datos generales del paciente, en modo lectura con botón Editar.
 *
 * Se usa desde la consulta y desde la ficha del paciente: por eso
 * `consultationId` es opcional — recepción debe poder corregir un teléfono
 * sin tener que abrir una consulta.
 */
export function PatientGeneralSection({
  data,
  canEdit,
  consultationId,
}: {
  data: PatientData;
  canEdit: boolean;
  consultationId?: string;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <Card>
        <CardContent className="pt-6">
          <form action={updatePatientGeneralAction} className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <input type="hidden" name="patientId" value={data.patientId} />
            {consultationId && <input type="hidden" name="consultationId" value={consultationId} />}
            <div><Label>Nombre(s)</Label><Input name="firstName" required defaultValue={data.firstName} /></div>
            <div><Label>Primer apellido</Label><Input name="lastName1" required defaultValue={data.lastName1} /></div>
            <div><Label>Segundo apellido</Label><Input name="lastName2" defaultValue={data.lastName2} /></div>
            <div><Label>Fecha de nacimiento</Label><Input name="birthDate" type="date" required defaultValue={data.birthDate} /></div>
            <div>
              <Label>Sexo</Label>
              <Select name="sex" defaultValue={data.sex || "UNDETERMINED"}>
                <option value="FEMALE">Femenino</option>
                <option value="MALE">Masculino</option>
                <option value="UNDETERMINED">Sin especificar</option>
              </Select>
            </div>
            <div>
              <Label>Estado civil</Label>
              <Select name="maritalStatus" defaultValue={data.maritalStatus}>
                <option value="">— Selecciona —</option>
                <option value="SINGLE">Soltero(a)</option>
                <option value="MARRIED">Casado(a)</option>
                <option value="FREE_UNION">Unión libre</option>
                <option value="DIVORCED">Divorciado(a)</option>
                <option value="WIDOWED">Viudo(a)</option>
                <option value="OTHER">Otro</option>
              </Select>
            </div>
            <div><Label>Teléfono</Label><Input name="phone" defaultValue={data.phone} /></div>
            <div><Label>Correo</Label><Input name="email" type="email" defaultValue={data.email} /></div>
            <div><Label>Ocupación</Label><Input name="occupation" defaultValue={data.occupation} /></div>
            <div className="md:col-span-2"><Label>Dirección</Label><Input name="address" defaultValue={data.address} /></div>
            <div><Label>Tipo de sangre</Label><Input name="bloodType" defaultValue={data.bloodType} placeholder="O+, A-, etc." /></div>
            <div><Label>Ciudad</Label><Input name="city" defaultValue={data.city} /></div>
            <div><Label>Estado</Label><Input name="state" defaultValue={data.state} /></div>
            <div><Label>CURP</Label><Input name="curp" defaultValue={data.curp} /></div>
            <div className="flex items-end gap-2 md:col-span-3">
              <Button type="submit" size="sm">Guardar cambios</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-start justify-between">
          <p className="text-sm font-medium">Información del paciente</p>
          {canEdit && (
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
              Editar
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Field label="Expediente (ID)" value={data.recordNumber} />
          <Field label="Nombre" value={`${data.firstName} ${data.lastName1} ${data.lastName2}`} />
          <Field label="Edad" value={`${data.age} años`} />
          <Field label="Sexo" value={SEX[data.sex] ?? data.sex} />
          <Field label="Teléfono" value={data.phone} />
          <Field label="Correo" value={data.email} />
          <Field label="Estado civil" value={data.maritalStatus ? MARITAL[data.maritalStatus] : ""} />
          <Field label="Ocupación" value={data.occupation} />
          <Field label="Dirección" value={data.address} />
          <Field label="Ciudad / Estado" value={[data.city, data.state].filter(Boolean).join(", ")} />
          <Field label="Tipo de sangre" value={data.bloodType} />
        </div>
        <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 md:grid-cols-3">
          <Field label="Alergias" value={data.allergiesText} />
          <Field label="Enfermedades crónicas" value={data.chronicText} />
          <Field label="Medicamentos actuales" value={data.medsText} />
        </div>
      </CardContent>
    </Card>
  );
}
