"use client";

import { useState, type ReactNode } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { updatePrescriptionTemplateAction, type ActionState } from "@/lib/actions/settings";
import type { TemplateConfig } from "@/lib/prescription-template";
import type { Letterhead } from "@/components/documents/letterhead";
import { PrescriptionDocument, type PrescriptionDocProps } from "@/app/(app)/prescriptions/[id]/prescription-document";

type PreviewData = {
  logoUrl: string | null;
  clinic: { name: string; address: string; phone: string; email: string };
  doctor: {
    name: string;
    specialty: string;
    license: string;
    specialtyLicense: string;
    ssaNumber: string;
    stateRegistration: string;
  };
  social: { website: string; facebook: string; instagram: string };
};

function Save() {
  const { pending } = useFormStatus();
  return <Button type="submit" size="sm" disabled={pending}>{pending ? "Guardando..." : "Guardar plantilla"}</Button>;
}

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

export function PrescriptionTemplateEditor({ initial, preview }: { initial: TemplateConfig; preview: PreviewData }) {
  const [cfg, setCfg] = useState<TemplateConfig>(initial);
  const [state, formAction] = useFormState(updatePrescriptionTemplateAction, null as ActionState);

  const setHeader = (p: Partial<TemplateConfig["header"]>) => setCfg((c) => ({ ...c, header: { ...c.header, ...p } }));
  const setFooter = (p: Partial<TemplateConfig["footer"]>) => setCfg((c) => ({ ...c, footer: { ...c.footer, ...p } }));

  const { clinic, doctor, social } = preview;

  // Membrete de muestra: refleja en vivo lo que se va configurando arriba.
  const lh: Letterhead = {
    cfg,
    logoUrl: preview.logoUrl,
    clinicName: clinic.name || "Consultorio",
    clinicAddress: clinic.address,
    clinicPhone: clinic.phone,
    email: clinic.email,
    social: { website: social.website, facebook: social.facebook, instagram: social.instagram },
    doctorName: doctor.name || "Nombre del médico",
    specialty: doctor.specialty,
    license: doctor.license,
    specialtyLicense: doctor.specialtyLicense,
    licenseLines: [
      doctor.license && `Cédula profesional ${doctor.license}`,
      doctor.specialtyLicense && `Cédula de especialidad ${doctor.specialtyLicense}`,
    ].filter(Boolean) as string[],
    ssaNumber: doctor.ssaNumber,
    stateRegistration: doctor.stateRegistration,
  };

  const docProps: PrescriptionDocProps = {
    lh,
    folio: "RX-2026-0001",
    dateStr: "13 de julio de 2026",
    dob: "12/05/1990",
    statusLabel: "Emitida",
    isVoid: false,
    patientName: "María González López",
    age: 36,
    sexLabel: "Femenino",
    allergies: "Penicilina, Mariscos",
    diagnosis: "Hipertensión arterial (I10)",
    items: [
      { id: "1", medicationName: "Vastionin", activeIngredient: "isotretinoína", presentation: "cápsulas 20 mg", quantityToDispense: "Una caja con 30 cápsulas", dose: "1 cápsula", route: "Oral", frequency: "cada 48 h", duration: "60 días", instructions: "con alimentos" },
      { id: "2", medicationName: "Losartán 50 mg", activeIngredient: null, presentation: "tableta", quantityToDispense: null, dose: "1 tableta", route: "Oral", frequency: "cada 24 h", duration: "30 días", instructions: "por la mañana" },
    ],
    generalInstructions: "",
    recommendations: "Dieta baja en sodio, medir presión a diario.",
    paperSize: cfg.paperSize,
  };

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="config" value={JSON.stringify(cfg)} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-medium">Encabezado</p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            <Toggle checked={cfg.header.showLogo} onChange={(v) => setHeader({ showLogo: v })}>Logotipo</Toggle>
            <Toggle checked={cfg.header.showClinicName} onChange={(v) => setHeader({ showClinicName: v })}>Nombre del consultorio</Toggle>
            <Toggle checked={cfg.header.showDoctorName} onChange={(v) => setHeader({ showDoctorName: v })}>Nombre del médico</Toggle>
            <Toggle checked={cfg.header.showSpecialty} onChange={(v) => setHeader({ showSpecialty: v })}>Especialidad</Toggle>
            <Toggle checked={cfg.header.showLicense} onChange={(v) => setHeader({ showLicense: v })}>Cédula profesional</Toggle>
            <Toggle checked={cfg.header.showSpecialtyLicense} onChange={(v) => setHeader({ showSpecialtyLicense: v })}>Cédula de especialidad</Toggle>
            <Toggle checked={cfg.header.showEmail} onChange={(v) => setHeader({ showEmail: v })}>Correo</Toggle>
          </div>
          <div className="mt-2">
            <Label>Texto adicional del encabezado</Label>
            <Textarea rows={2} value={cfg.header.extraText} onChange={(e) => setHeader({ extraText: e.target.value })} />
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium">Contenido y formato</p>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              <Toggle checked={cfg.showDiagnosis} onChange={(v) => setCfg((c) => ({ ...c, showDiagnosis: v }))}>Mostrar diagnóstico</Toggle>
              <Toggle checked={cfg.showAllergies} onChange={(v) => setCfg((c) => ({ ...c, showAllergies: v }))}>Mostrar alergias</Toggle>
            </div>
            <div className="mt-2">
              <Label>Tamaño de hoja</Label>
              <Select value={cfg.paperSize} onChange={(e) => setCfg((c) => ({ ...c, paperSize: e.target.value as "full" | "half" }))}>
                <option value="full">Hoja completa (carta)</option>
                <option value="half">Media hoja (media carta)</option>
              </Select>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Pie de página</p>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              <Toggle checked={cfg.footer.showPhone} onChange={(v) => setFooter({ showPhone: v })}>Teléfono</Toggle>
              <Toggle checked={cfg.footer.showWhatsapp} onChange={(v) => setFooter({ showWhatsapp: v })}>WhatsApp</Toggle>
              <Toggle checked={cfg.footer.showEmail} onChange={(v) => setFooter({ showEmail: v })}>Correo</Toggle>
              <Toggle checked={cfg.footer.showWebsite} onChange={(v) => setFooter({ showWebsite: v })}>Página web</Toggle>
            </div>
            <div className="mt-2">
              <Label>Texto / aviso del pie</Label>
              <Textarea rows={2} value={cfg.footer.customText} onChange={(e) => setFooter({ customText: e.target.value })} placeholder="Ej. Esta receta es válida por 30 días." />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Save />
        {state?.ok && <span className="text-xs text-green-700">✓ Guardado</span>}
        {state && !state.ok && <span className="text-xs text-red-700">{state.message}</span>}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-muted-foreground">Vista previa</p>
        <div className="overflow-x-auto rounded-xl bg-background p-6">
          <PrescriptionDocument {...docProps} />
        </div>
      </div>
    </form>
  );
}
