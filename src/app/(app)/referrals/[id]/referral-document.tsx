import {
  DocumentPaper,
  DocumentHeader,
  DocumentFooter,
  PatientBar,
  type Letterhead,
} from "@/components/documents/letterhead";

export type ReferralDocProps = {
  lh: Letterhead;
  folio: string;
  dateStr: string;
  paperSize: "full" | "half";
  isVoid: boolean;
  statusLabel: string;
  /** Paciente */
  patientName: string;
  age: number;
  sexLabel: string;
  dob: string;
  /** Médico receptor */
  toDoctorName: string;
  toDoctorSpecialty: string;
  toOrganization: string;
  /** Contenido de la solicitud */
  priorityLabel: string;
  isUrgent: boolean;
  reason: string;
  comments: string;
  /** Resumen clínico autorizado por el paciente */
  sharedItems: { id: string; fieldLabel: string; valueText: string }[];
  patientAuthorized: boolean;
};

/**
 * Solicitud de referencia médica en papel: mismo membrete que la receta,
 * para que el paciente lleve un documento físico al médico receptor.
 */
export function ReferralDocument(p: ReferralDocProps) {
  return (
    <DocumentPaper paperSize={p.paperSize}>
      {p.isVoid && (
        <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-1.5 text-center text-sm font-semibold text-red-700">
          Referencia {p.statusLabel} — no válida
        </div>
      )}

      <DocumentHeader lh={p.lh} />

      {/* Título del documento: lo que distingue esta hoja de una receta */}
      <div className="mt-5 flex items-baseline justify-between gap-4 border-b border-slate-200 pb-2">
        <h1 className="text-[15px] font-bold uppercase tracking-wide text-slate-900">
          Solicitud de referencia médica
        </h1>
        <span className="shrink-0 text-[11px] text-slate-500">Folio {p.folio}</span>
      </div>

      <PatientBar patientName={p.patientName} dateStr={p.dateStr} />

      <div className="mt-3 text-slate-600">
        {p.dob && <div>Fecha de nacimiento: {p.dob}</div>}
        <div>
          Edad: {p.age} años{p.sexLabel ? ` · ${p.sexLabel}` : ""}
        </div>
      </div>

      {/* Destinatario */}
      <div className="mt-5">
        <div className="text-[11px] uppercase tracking-wider text-slate-500">Se refiere a</div>
        <div className="mt-1 text-slate-900">
          <span className="font-semibold">{p.toDoctorName}</span>
          {p.toDoctorSpecialty ? <span className="text-slate-600"> · {p.toDoctorSpecialty}</span> : null}
        </div>
        {p.toOrganization && <div className="text-slate-600">{p.toOrganization}</div>}
      </div>

      {/* Motivo */}
      <div className="mt-4">
        <div className="text-[11px] uppercase tracking-wider text-slate-500">Motivo de la referencia</div>
        <p className="mt-1 text-slate-800">{p.reason}</p>
        {p.isUrgent && (
          <p className="mt-1 font-semibold text-red-700">Prioridad: {p.priorityLabel}</p>
        )}
        {!p.isUrgent && <p className="mt-1 text-slate-600">Prioridad: {p.priorityLabel}</p>}
      </div>

      {/* Resumen clínico */}
      {p.sharedItems.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-500">Resumen clínico</div>
          <div className="mt-1.5 space-y-1">
            {p.sharedItems.map((item) => (
              <div key={item.id} style={{ breakInside: "avoid" }}>
                <span className="font-semibold text-slate-900">{item.fieldLabel}:</span>{" "}
                <span className="text-slate-700">{item.valueText || "Sin registro"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {p.comments && (
        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-500">Comentarios del médico referente</div>
          <p className="mt-1 text-slate-800">{p.comments}</p>
        </div>
      )}

      {p.patientAuthorized && (
        <p className="mt-4 text-[10px] italic text-slate-500">
          El paciente autorizó compartir la información clínica arriba descrita con el médico receptor.
        </p>
      )}

      <DocumentFooter lh={p.lh} />
    </DocumentPaper>
  );
}
