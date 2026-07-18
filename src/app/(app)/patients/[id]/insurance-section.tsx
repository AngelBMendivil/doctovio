"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  linkInsuranceAction,
  updateInsuranceStatusAction,
  type ActionState,
} from "@/lib/actions/insurers";

type ChecklistItem = { label: string; done: boolean };

type Insurance = {
  id: string;
  insurerName: string;
  policyNumber: string | null;
  affiliateNumber: string | null;
  authorizationStatus: string;
  authorizationNumber: string | null;
  checklistJson: unknown;
  insurer: {
    requiresPreAuthorization: boolean;
    authorizationInstructions: string | null;
    protocolNotes: string | null;
  } | null;
};

type InsurerOption = { id: string; name: string };

const AUTH_OPTIONS: { value: string; label: string }[] = [
  { value: "NOT_REQUIRED", label: "No requiere autorización" },
  { value: "PENDING", label: "Pendiente" },
  { value: "REQUESTED", label: "Autorización solicitada" },
  { value: "APPROVED", label: "Autorizada" },
  { value: "REJECTED", label: "Rechazada" },
];

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Guardando..." : label}
    </Button>
  );
}

function parseChecklist(raw: unknown): ChecklistItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x === "object" && "label" in x)
    .map((x) => ({ label: String((x as ChecklistItem).label), done: Boolean((x as ChecklistItem).done) }));
}

function InsuranceCard({ patientId, ins }: { patientId: string; ins: Insurance }) {
  const [state, formAction] = useFormState(updateInsuranceStatusAction, null as ActionState);
  const checklist = parseChecklist(ins.checklistJson);
  const doneCount = checklist.filter((c) => c.done).length;

  return (
    <form action={formAction} className="space-y-3 rounded-md border border-border p-4">
      <input type="hidden" name="patientInsuranceId" value={ins.id} />
      <input type="hidden" name="patientId" value={patientId} />

      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{ins.insurerName}</p>
          <p className="text-xs text-muted-foreground">
            Póliza: {ins.policyNumber || "—"} · Afiliado: {ins.affiliateNumber || "—"}
          </p>
        </div>
        {ins.insurer?.requiresPreAuthorization && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            Requiere autorización previa
          </span>
        )}
      </div>

      {(ins.insurer?.authorizationInstructions || ins.insurer?.protocolNotes) && (
        <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
          {ins.insurer?.authorizationInstructions && (
            <p><b>Autorización:</b> {ins.insurer.authorizationInstructions}</p>
          )}
          {ins.insurer?.protocolNotes && <p><b>Protocolo:</b> {ins.insurer.protocolNotes}</p>}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <Label>Estatus de autorización</Label>
          <Select name="authorizationStatus" defaultValue={ins.authorizationStatus}>
            {AUTH_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Número de autorización</Label>
          <Input name="authorizationNumber" defaultValue={ins.authorizationNumber ?? ""} />
        </div>
      </div>

      {checklist.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium">
            Requisitos ({doneCount}/{checklist.length})
          </p>
          <div className="space-y-1">
            {checklist.map((item, i) => (
              <label key={i} className="flex items-center gap-2">
                <input type="hidden" name="checklistLabel" value={item.label} />
                <input type="checkbox" name={`checklistDone_${i}`} defaultChecked={item.done} />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <SaveButton label="Guardar seguimiento" />
        {state && (
          <span className={state.ok ? "text-xs text-green-700" : "text-xs text-red-700"}>{state.message}</span>
        )}
      </div>
    </form>
  );
}

function LinkInsuranceForm({ patientId, insurers }: { patientId: string; insurers: InsurerOption[] }) {
  const [state, formAction] = useFormState(linkInsuranceAction, null as ActionState);

  if (insurers.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No hay aseguradoras en el catálogo. Agrégalas en Configuración → Aseguradoras para poder ligarlas.
      </p>
    );
  }

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 rounded-md border border-dashed border-border p-4 md:grid-cols-2">
      <p className="md:col-span-2 font-medium">Ligar aseguradora</p>
      <input type="hidden" name="patientId" value={patientId} />
      <div className="md:col-span-2">
        <Label>Aseguradora</Label>
        <Select name="insurerId" defaultValue="">
          <option value="" disabled>— Selecciona —</option>
          {insurers.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Número de póliza</Label>
        <Input name="policyNumber" />
      </div>
      <div>
        <Label>Número de afiliado</Label>
        <Input name="affiliateNumber" />
      </div>
      <div className="flex items-center gap-3 md:col-span-2">
        <SaveButton label="Ligar aseguradora" />
        {state && (
          <span className={state.ok ? "text-xs text-green-700" : "text-xs text-red-700"}>{state.message}</span>
        )}
      </div>
    </form>
  );
}

export function InsuranceSection({
  patientId,
  insurances,
  insurers,
}: {
  patientId: string;
  insurances: Insurance[];
  insurers: InsurerOption[];
}) {
  return (
    <Card id="seguro">
      <CardHeader><CardTitle>Seguro y protocolos</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        {insurances.length === 0 && (
          <p className="text-muted-foreground">Este paciente no tiene un seguro ligado.</p>
        )}
        {insurances.map((ins) => (
          <InsuranceCard key={ins.id} patientId={patientId} ins={ins} />
        ))}
        <LinkInsuranceForm patientId={patientId} insurers={insurers} />
      </CardContent>
    </Card>
  );
}
