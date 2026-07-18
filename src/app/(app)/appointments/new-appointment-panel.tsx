"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { UserCheck, UserPlus, Loader2, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { createAppointmentAction } from "@/lib/actions/appointments";
import { bookFirstTimeAction } from "@/lib/actions/preregistration";
import { findPatientMatchesAction, type PatientMatch } from "@/lib/actions/patient-match";
import { TimeSelect } from "./time-select";
import { PreRegLinkResult } from "./prereg-link-result";

type Doctor = { id: string; fullName: string };

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Agendando..." : label}
    </Button>
  );
}

/**
 * Agendar: un solo camino.
 *
 * Recepción captura siempre los mismos datos mínimos. El sistema busca
 * coincidencias y de ahí se DERIVA si el paciente es nuevo o ya existe —
 * nunca lo elige el usuario. Así no hay forma de crear un duplicado sin
 * haber visto antes al candidato.
 */
export function NewAppointmentPanel({ doctors, defaultDate }: { doctors: Doctor[]; defaultDate: string }) {
  // Datos de identificación
  const [firstName, setFirstName] = useState("");
  const [lastName1, setLastName1] = useState("");
  const [lastName2, setLastName2] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState("");

  const [matches, setMatches] = useState<PatientMatch[]>([]);
  const [selected, setSelected] = useState<PatientMatch | null>(null);
  const [notDuplicate, setNotDuplicate] = useState(false);
  const [searching, startSearch] = useTransition();

  const [bookState, bookAction] = useFormState(bookFirstTimeAction, null);

  const hasName = firstName.trim().length > 1 && lastName1.trim().length > 1;
  const canSearch = hasName || phone.replace(/\D/g, "").length >= 7 || birthDate !== "";

  // Búsqueda en vivo, con espera para no consultar en cada tecla.
  useEffect(() => {
    if (selected || !canSearch) {
      if (!selected) setMatches([]);
      return;
    }
    const t = setTimeout(() => {
      startSearch(async () => {
        const found = await findPatientMatchesAction({ firstName, lastName1, phone, email, birthDate });
        setMatches(found);
      });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstName, lastName1, phone, email, birthDate, selected]);

  const isNew = canSearch && matches.length === 0 && !selected;
  const readyToBook = Boolean(selected) || (isNew && phone.replace(/\D/g, "").length >= 10 && birthDate) || notDuplicate;

  // El enlace de prerregistro recién generado.
  if (bookState?.ok) {
    return <PreRegLinkResult url={bookState.message} patientName={`${firstName} ${lastName1}`} phone={phone} />;
  }

  return (
    <div className="space-y-5">
      {/* Paso 1 — identificar */}
      <div>
        <p className="mb-2 text-[13px] font-semibold text-navy">Datos del paciente</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="fn" required>Nombre</Label>
            <Input id="fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="off" disabled={!!selected} />
          </div>
          <div>
            <Label htmlFor="ln1" required>Apellido paterno</Label>
            <Input id="ln1" value={lastName1} onChange={(e) => setLastName1(e.target.value)} autoComplete="off" disabled={!!selected} />
          </div>
          <div>
            <Label htmlFor="ln2">Apellido materno</Label>
            <Input id="ln2" value={lastName2} onChange={(e) => setLastName2(e.target.value)} autoComplete="off" disabled={!!selected} />
          </div>
          <div>
            <Label htmlFor="ph" required>Teléfono</Label>
            <Input id="ph" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" placeholder="6643752177" disabled={!!selected} />
          </div>
          <div>
            <Label htmlFor="em">Correo</Label>
            <Input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" disabled={!!selected} />
          </div>
          <div>
            <Label htmlFor="bd" required>Fecha de nacimiento</Label>
            <Input id="bd" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} disabled={!!selected} />
          </div>
        </div>
      </div>

      {/* Paso 2 — el sistema decide */}
      {searching && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando coincidencias…
        </p>
      )}

      {!selected && matches.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            Ya existe {matches.length === 1 ? "un expediente parecido" : `${matches.length} expedientes parecidos`}
          </p>
          <div className="space-y-1.5">
            {matches.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelected(m)}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm hover:border-primary"
              >
                <span>
                  <span className="font-medium text-navy">{m.fullName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {m.recordNumber} · {m.age} años · {m.phone || "sin teléfono"}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-medium text-primary">Es este</span>
              </button>
            ))}
          </div>
          <label className="mt-2.5 flex items-center gap-2 text-xs text-amber-800">
            <input type="checkbox" checked={notDuplicate} onChange={(e) => setNotDuplicate(e.target.checked)} />
            Es otra persona distinta — crear expediente nuevo
          </label>
        </div>
      )}

      {selected && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
          <span className="flex items-center gap-2 text-sm">
            <UserCheck className="h-4 w-4 text-primary" />
            <span>
              <span className="font-semibold text-navy">{selected.fullName}</span>
              <span className="block text-xs text-muted-foreground">{selected.recordNumber} · paciente registrado</span>
            </span>
          </span>
          <button type="button" onClick={() => setSelected(null)} className="text-xs font-medium text-primary">
            Cambiar
          </button>
        </div>
      )}

      {isNew && (
        <div className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/5 px-3 py-2.5 text-sm text-navy">
          <UserPlus className="h-4 w-4 text-accent" />
          <span>
            <span className="font-semibold">Paciente nuevo.</span> Se creará su expediente y se le enviará el
            prerregistro para que llene su historia clínica.
          </span>
        </div>
      )}

      {/* Paso 3 — la cita */}
      {readyToBook && (
        <form action={selected ? createAppointmentAction : bookAction} className="space-y-3 border-t border-border pt-4">
          {selected ? (
            <>
              <input type="hidden" name="patientId" value={selected.id} />
              <input type="hidden" name="type" value="EXISTING_PATIENT" />
            </>
          ) : (
            <>
              <input type="hidden" name="firstName" value={firstName} />
              <input type="hidden" name="lastName1" value={lastName1} />
              <input type="hidden" name="lastName2" value={lastName2} />
              <input type="hidden" name="phone" value={phone} />
              <input type="hidden" name="email" value={email} />
              <input type="hidden" name="birthDate" value={birthDate} />
              {notDuplicate && <input type="hidden" name="confirmedNotDuplicate" value="true" />}
            </>
          )}

          <div>
            <Label htmlFor="doc" required>Médico</Label>
            <Select id="doc" name="doctorId" required>
              <option value="">Selecciona…</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>{d.fullName}</option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="sd" required>Fecha</Label>
              <Input id="sd" name="scheduledDate" type="date" defaultValue={defaultDate} required />
            </div>
            <div>
              <Label required>Hora</Label>
              <TimeSelect />
            </div>
          </div>

          <div>
            <Label htmlFor="rs">Motivo</Label>
            <Input id="rs" name="reason" autoComplete="off" />
          </div>

          <div className="flex items-center gap-2">
            <input id="ob" name="allowOverbook" type="checkbox" />
            <Label htmlFor="ob" className="mb-0">Permitir sobrecupo (autorizado por el médico)</Label>
          </div>

          {bookState && !bookState.ok && <Alert>{bookState.message}</Alert>}

          <Submit label={selected ? "Agendar cita" : "Agendar y enviar prerregistro"} />
        </form>
      )}

      {!readyToBook && !searching && (
        <p className="text-xs text-muted-foreground">
          Captura al menos nombre, apellido, teléfono y fecha de nacimiento para continuar.
        </p>
      )}
    </div>
  );
}
