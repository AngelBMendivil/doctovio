"use client";

import { useRef, useState, type ReactNode } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { CountryStateSelect } from "@/app/(app)/settings/country-state-select";
import { submitPreRegistrationAction, type ActionState } from "@/lib/actions/preregistration";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Enviando..." : "Enviar mis datos"}
    </Button>
  );
}

const GRID = "grid grid-cols-1 gap-4 md:grid-cols-2";

// Alérgenos más comunes en la práctica clínica, agrupados. No existe una NOM
// con un listado fijo; NOM-004 obliga a registrar alergias pero no las enumera.
const ALLERGY_GROUPS: { title: string; items: string[] }[] = [
  {
    title: "Medicamentos",
    items: [
      "Penicilina",
      "Sulfas (antibióticos, p. ej. trimetoprima/sulfametoxazol)",
      "AINEs (ibuprofeno, naproxeno)",
      "Ácido acetilsalicílico (aspirina)",
      "Anestésicos locales",
      "Medio de contraste yodado",
    ],
  },
  {
    title: "Alimentos",
    items: [
      "Mariscos",
      "Pescado",
      "Cacahuate",
      "Nueces y frutos secos",
      "Huevo",
      "Leche",
      "Soya",
      "Trigo / gluten",
      "Fresa",
    ],
  },
  {
    title: "Ambientales y otros",
    items: [
      "Polen",
      "Ácaros del polvo",
      "Pelo de animales",
      "Moho",
      "Látex",
      "Picadura de insectos (abeja, avispa)",
    ],
  },
];

// Tipos de cáncer más comunes (antecedentes familiares).
const CANCER_TYPES: string[] = [
  "Mama",
  "Próstata",
  "Colon y recto",
  "Pulmón",
  "Cervicouterino (cuello uterino)",
  "Estómago",
  "Hígado",
  "Páncreas",
  "Tiroides",
  "Leucemia",
  "Linfoma",
  "Piel (melanoma)",
  "Ovario",
];

// Sustancias psicoactivas más comunes (toxicomanías).
const SUBSTANCES: string[] = [
  "Marihuana",
  "Cocaína",
  "Anfetaminas / metanfetaminas",
  "Inhalantes",
  "Opioides (heroína, etc.)",
  "Éxtasis / MDMA",
  "Alucinógenos (LSD, hongos)",
  "Benzodiacepinas sin receta",
];

// Enfermedades crónicas más frecuentes (para el checklist).
const CHRONIC_CONDITIONS: string[] = [
  "Diabetes tipo 2",
  "Diabetes tipo 1",
  "Hipertensión arterial",
  "Colesterol/triglicéridos altos (dislipidemia)",
  "Obesidad",
  "Asma",
  "EPOC",
  "Enfermedad de la tiroides",
  "Enfermedad renal crónica",
  "Enfermedad del corazón",
  "Artritis / artrosis",
  "Cáncer",
  "Epilepsia",
  "Depresión / ansiedad",
  "Enfermedad del hígado",
];

export function PreRegistrationForm({
  token,
  orgName,
  insurers,
  prefill,
}: {
  token: string;
  orgName: string;
  insurers: { id: string; name: string }[];
  /** Lo que recepción ya capturó al agendar: no se le vuelve a pedir al paciente. */
  prefill?: {
    firstName: string;
    lastName1: string;
    lastName2: string;
    birthDate: string;
    phone: string;
    email: string;
  } | null;
}) {
  const [state, formAction] = useFormState(submitPreRegistrationAction, null as ActionState);
  // Declaraciones explícitas de ausencia: sin esto, "no tengo alergias" y
  // "no llené esa parte" llegan idénticos al expediente.
  const [noAllergies, setNoAllergies] = useState(false);
  const [noChronic, setNoChronic] = useState(false);
  const [noFamily, setNoFamily] = useState(false);
  const [hasSurgeries, setHasSurgeries] = useState(false);
  const [familyCancer, setFamilyCancer] = useState(false);
  const [usesSubstances, setUsesSubstances] = useState(false);

  // Asistente por pasos: no se puede enviar hasta llegar al último paso.
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  if (state?.ok) {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700">✓</div>
        <h1 className="mb-2 text-xl font-semibold">¡Gracias!</h1>
        <p className="text-sm text-muted-foreground">
          Recibimos tu información. El consultorio la revisará y completará tu registro. Ya puedes cerrar esta página.
        </p>
      </div>
    );
  }

  const personales = (
    <div className={GRID}>
      <div>
        <Label>Nombre(s) *</Label>
        <Input name="firstName" defaultValue={prefill?.firstName ?? ""} />
      </div>
      <div>
        <Label>Primer apellido *</Label>
        <Input name="lastName1" defaultValue={prefill?.lastName1 ?? ""} />
      </div>
      <div>
        <Label>Segundo apellido</Label>
        <Input name="lastName2" defaultValue={prefill?.lastName2 ?? ""} />
      </div>
      <div>
        <Label>Fecha de nacimiento *</Label>
        <Input name="birthDate" type="date" defaultValue={prefill?.birthDate ?? ""} />
      </div>
      <div>
        <Label>Sexo *</Label>
        <Select name="sex" defaultValue="">
          <option value="" disabled>— Selecciona —</option>
          <option value="FEMALE">Femenino</option>
          <option value="MALE">Masculino</option>
          <option value="UNDETERMINED">Prefiero no decir</option>
        </Select>
      </div>
      <div>
        <Label>Teléfono</Label>
        <Input name="phone" defaultValue={prefill?.phone ?? ""} />
      </div>
      <div>
        <Label>Correo electrónico</Label>
        <Input name="email" type="email" defaultValue={prefill?.email ?? ""} />
      </div>
      <div>
        <Label>Ocupación</Label>
        <Input name="occupation" />
      </div>
      <div>
        <Label>Estado civil</Label>
        <Select name="maritalStatus" defaultValue="">
          <option value="">— Selecciona —</option>
          <option value="SINGLE">Soltero(a)</option>
          <option value="MARRIED">Casado(a)</option>
          <option value="FREE_UNION">Unión libre</option>
          <option value="DIVORCED">Divorciado(a)</option>
          <option value="WIDOWED">Viudo(a)</option>
          <option value="OTHER">Otro</option>
        </Select>
      </div>
    </div>
  );

  const domicilio = (
    <div className={GRID}>
      <div className="md:col-span-2">
        <Label>Calle y número</Label>
        <Input name="address" />
      </div>
      <CountryStateSelect />
      <div>
        <Label>Ciudad</Label>
        <Input name="city" />
      </div>
      <div>
        <Label>Código postal</Label>
        <Input name="postalCode" />
      </div>
    </div>
  );

  const emergencia = (
    <div className={GRID}>
      <div>
        <Label>Nombre</Label>
        <Input name="emergencyContactName" />
      </div>
      <div>
        <Label>Parentesco</Label>
        <Select name="emergencyContactRelationship" defaultValue="">
          <option value="">— Selecciona —</option>
          <option value="Madre">Madre</option>
          <option value="Padre">Padre</option>
          <option value="Cónyuge">Cónyuge</option>
          <option value="Hijo(a)">Hijo(a)</option>
          <option value="Hermano(a)">Hermano(a)</option>
          <option value="Amigo(a)">Amigo(a)</option>
          <option value="Tutor legal">Tutor legal</option>
          <option value="Otro">Otro</option>
        </Select>
      </div>
      <div>
        <Label>Teléfono</Label>
        <Input name="emergencyContactPhone" />
      </div>
    </div>
  );

  const aseguradora = (
    <div className={GRID}>
      <div className="md:col-span-2">
        <Label>¿Cuentas con seguro de gastos médicos?</Label>
        <Select name="insurerId" defaultValue="">
          <option value="">Ninguna / Particular</option>
          {insurers.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </Select>
        {insurers.length === 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            El consultorio no tiene aseguradoras registradas. Puedes continuar como particular.
          </p>
        )}
      </div>
      <div>
        <Label>Número de póliza</Label>
        <Input name="insurancePolicyNumber" />
      </div>
      <div>
        <Label>Número de afiliado</Label>
        <Input name="insuranceAffiliateNumber" />
      </div>
    </div>
  );

  const clinico = (
    <div className={GRID}>
      <div className="md:col-span-2">
        <Label>Alergias conocidas</Label>
        <p className="mb-2 text-xs text-muted-foreground">
          Marca las que apliquen. Si no tienes ninguna, márcalo explícitamente.
        </p>

        {/* Declaración explícita: "no tengo alergias" y "no contesté" no son lo
            mismo para el médico. Al marcarla se apaga y bloquea todo lo demás. */}
        <label className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm font-medium">
          <input
            type="checkbox"
            name="noAllergies"
            checked={noAllergies}
            onChange={(e) => setNoAllergies(e.target.checked)}
          />
          No tengo ninguna alergia conocida
        </label>

        <div className={`space-y-3 ${noAllergies ? "pointer-events-none opacity-40" : ""}`}>
          {ALLERGY_GROUPS.map((g) => (
            <div key={g.title}>
              <p className="text-xs font-medium text-muted-foreground">{g.title}</p>
              <div className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
                {g.items.map((item) => (
                  <label key={item} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="allergyCommon" value={item} disabled={noAllergies} />
                    {item}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      {!noAllergies && (
        <div className="md:col-span-2">
          <Label>Otras alergias (una por línea)</Label>
          <Textarea name="allergiesOther" rows={2} placeholder="Alguna alergia que no esté en la lista" />
        </div>
      )}
      <div className="md:col-span-2">
        <Label>Enfermedades crónicas</Label>
        <p className="mb-2 text-xs text-muted-foreground">
          Marca las que apliquen. Si no tienes ninguna, márcalo explícitamente.
        </p>

        <label className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm font-medium">
          <input
            type="checkbox"
            name="noChronic"
            checked={noChronic}
            onChange={(e) => setNoChronic(e.target.checked)}
          />
          No tengo ninguna enfermedad crónica
        </label>

        <div className={`grid grid-cols-1 gap-1 sm:grid-cols-2 ${noChronic ? "pointer-events-none opacity-40" : ""}`}>
          {CHRONIC_CONDITIONS.map((item) => (
            <label key={item} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="chronicCommon" value={item} disabled={noChronic} />
              {item}
            </label>
          ))}
        </div>
      </div>
      {!noChronic && (
        <div className="md:col-span-2">
          <Label>Otras enfermedades crónicas (una por línea)</Label>
          <Textarea name="chronicOther" rows={2} placeholder="Alguna enfermedad que no esté en la lista" />
        </div>
      )}
      <div className="md:col-span-2">
        <Label>Medicamentos que tomas actualmente (uno por línea)</Label>
        <Textarea name="currentMedications" rows={3} placeholder={"Metformina 850mg\nLosartán 50mg"} />
      </div>
    </div>
  );

  const heredofamiliares = (
    <div className={GRID}>
      <p className="md:col-span-2 text-sm text-muted-foreground">
        Marca las enfermedades que existen en tu familia (padres, abuelos, hermanos). Si no hay ninguna, márcalo
        explícitamente.
      </p>

      <label className="md:col-span-2 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm font-medium">
        <input
          type="checkbox"
          name="noFamily"
          checked={noFamily}
          onChange={(e) => {
            setNoFamily(e.target.checked);
            if (e.target.checked) setFamilyCancer(false);
          }}
        />
        No tengo antecedentes familiares de estas enfermedades
      </label>

      <label className={`flex items-center gap-2 ${noFamily ? "opacity-40" : ""}`}>
        <input type="checkbox" name="familyDiabetes" disabled={noFamily} /> Diabetes
      </label>
      <label className={`flex items-center gap-2 ${noFamily ? "opacity-40" : ""}`}>
        <input type="checkbox" name="familyHypertension" disabled={noFamily} /> Hipertensión
      </label>
      <label className={`flex items-center gap-2 ${noFamily ? "opacity-40" : ""}`}>
        <input
          type="checkbox"
          name="familyCancer"
          checked={familyCancer}
          disabled={noFamily}
          onChange={(e) => setFamilyCancer(e.target.checked)}
        /> Cáncer
      </label>
      <label className={`flex items-center gap-2 ${noFamily ? "opacity-40" : ""}`}>
        <input type="checkbox" name="familyHeartDisease" disabled={noFamily} /> Enfermedad del corazón
      </label>
      <label className={`flex items-center gap-2 ${noFamily ? "opacity-40" : ""}`}>
        <input type="checkbox" name="familyHereditaryDisease" disabled={noFamily} /> Enfermedad hereditaria
      </label>

      {familyCancer && !noFamily && (
        <div className="md:col-span-2 rounded-md border border-border bg-muted/40 p-3">
          <p className="mb-2 text-xs font-medium">¿Qué tipo(s) de cáncer hay en la familia?</p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {CANCER_TYPES.map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="familyCancerType" value={c} />
                {c}
              </label>
            ))}
          </div>
        </div>
      )}

      {!noFamily && (
        <div className="md:col-span-2">
          <Label>Otros antecedentes familiares</Label>
          <Textarea name="familyOthers" rows={2} />
        </div>
      )}
    </div>
  );

  const estilo = (
    <div className={GRID}>
      <div>
        <Label>Tabaquismo</Label>
        <Select name="smoking" defaultValue="">
          <option value="">— Selecciona —</option>
          <option value="No">No</option>
          <option value="Ocasional">Ocasional</option>
          <option value="Sí">Sí</option>
        </Select>
      </div>
      <div>
        <Label>Alcohol</Label>
        <Select name="alcohol" defaultValue="">
          <option value="">— Selecciona —</option>
          <option value="No">No</option>
          <option value="Ocasional">Ocasional</option>
          <option value="Sí">Sí</option>
        </Select>
      </div>
      <div>
        <Label>Actividad física</Label>
        <Select name="exercise" defaultValue="">
          <option value="">— Selecciona —</option>
          <option value="Sedentario">Sedentario (sin actividad)</option>
          <option value="Ligera">Ligera (a veces)</option>
          <option value="Moderada">Moderada (2-3 veces por semana)</option>
          <option value="Intensa">Intensa (4 o más veces por semana)</option>
        </Select>
      </div>
      <div className="md:col-span-2">
        <Label>¿Consumes otras sustancias?</Label>
        <Select value={usesSubstances ? "si" : "no"} onChange={(e) => setUsesSubstances(e.target.value === "si")}>
          <option value="no">No</option>
          <option value="si">Sí</option>
        </Select>
      </div>
      {usesSubstances && (
        <div className="md:col-span-2 rounded-md border border-border bg-muted/40 p-3">
          <p className="mb-2 text-xs font-medium">¿Cuál(es)?</p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {SUBSTANCES.map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="substanceCommon" value={s} />
                {s}
              </label>
            ))}
          </div>
          <div className="mt-3">
            <Label>Otras (una por línea) y frecuencia</Label>
            <Textarea name="substanceOther" rows={2} placeholder="Ej. Otra sustancia — frecuencia" />
          </div>
        </div>
      )}
      <div className="md:col-span-2">
        <Label>¿Has tenido cirugías previas?</Label>
        <Select value={hasSurgeries ? "si" : "no"} onChange={(e) => setHasSurgeries(e.target.value === "si")}>
          <option value="no">No</option>
          <option value="si">Sí</option>
        </Select>
      </div>
      {hasSurgeries && (
        <div className="md:col-span-2">
          <Label>¿Cuál(es) y en qué fecha?</Label>
          <Textarea
            name="surgeriesNotes"
            rows={2}
            placeholder={"Ej. Apendicectomía — marzo 2020\nCesárea — 2018"}
          />
        </div>
      )}
      <div className="md:col-span-2">
        <Label>Hospitalizaciones previas</Label>
        <Textarea name="hospitalizationsNotes" rows={2} />
      </div>
      <div className="md:col-span-2">
        <Label>Enfermedades importantes que hayas tenido</Label>
        <Textarea name="priorDiseases" rows={2} />
      </div>
    </div>
  );

  const steps: { id: string; label: string; content: ReactNode }[] = [
    { id: "personales", label: "Datos personales", content: personales },
    { id: "domicilio", label: "Domicilio", content: domicilio },
    { id: "emergencia", label: "Contacto de emergencia", content: emergencia },
    { id: "aseguradora", label: "Aseguradora", content: aseguradora },
    { id: "clinico", label: "Alergias y enfermedades", content: clinico },
    { id: "heredo", label: "Antecedentes familiares", content: heredofamiliares },
    { id: "estilo", label: "Estilo de vida", content: estilo },
  ];
  const isLast = step === steps.length - 1;

  // Valida los campos obligatorios del primer paso antes de avanzar.
  function validateFirstStep(): string | null {
    const f = formRef.current;
    if (!f) return null;
    const required: { name: string; label: string }[] = [
      { name: "firstName", label: "Nombre(s)" },
      { name: "lastName1", label: "Primer apellido" },
      { name: "birthDate", label: "Fecha de nacimiento" },
      { name: "sex", label: "Sexo" },
    ];
    for (const r of required) {
      const el = f.elements.namedItem(r.name) as HTMLInputElement | HTMLSelectElement | null;
      if (el && !el.value.trim()) {
        el.focus();
        return `Completa "${r.label}" para continuar.`;
      }
    }
    return null;
  }

  function goNext() {
    if (step === 0) {
      const err = validateFirstStep();
      if (err) {
        setStepError(err);
        return;
      }
    }
    setStepError(null);
    setStep((s) => {
      const nextStep = Math.min(s + 1, steps.length - 1);
      setMaxStep((m) => Math.max(m, nextStep));
      return nextStep;
    });
  }

  function goPrev() {
    setStepError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  return (
    <form ref={formRef} action={formAction} className="mx-auto max-w-2xl space-y-6 pb-16">
      <input type="hidden" name="token" value={token} />

      <div className="text-center">
        <h1 className="text-2xl font-semibold">Prerregistro de paciente</h1>
        <p className="mt-1 text-sm text-muted-foreground">{orgName}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Paso {step + 1} de {steps.length}. Los campos con * son obligatorios.
        </p>
      </div>

      {state && !state.ok && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.message}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="mb-4 flex flex-wrap gap-1 border-b border-border">
          {steps.map((s, i) => (
            <button
              key={s.id}
              type="button"
              disabled={i > maxStep}
              onClick={() => i <= maxStep && setStep(i)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                i === step
                  ? "border-primary text-primary"
                  : i <= maxStep
                    ? "border-transparent text-muted-foreground hover:text-foreground"
                    : "border-transparent text-muted-foreground/40 cursor-not-allowed"
              )}
            >
              {i + 1}. {s.label}
            </button>
          ))}
        </div>

        {steps.map((s, i) => (
          <div key={s.id} hidden={i !== step}>
            {s.content}
          </div>
        ))}

        {stepError && <p className="mt-3 text-sm text-red-700">{stepError}</p>}

        <div className="mt-5 flex items-center justify-between">
          <Button type="button" variant="outline" onClick={goPrev} disabled={step === 0}>
            Anterior
          </Button>
          {isLast ? (
            <SubmitButton />
          ) : (
            <Button type="button" onClick={goNext}>
              Siguiente
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
