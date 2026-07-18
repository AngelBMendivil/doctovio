import type { TemplateConfig } from "@/lib/prescription-template";

/**
 * Membrete clínico compartido: encabezado, barra del paciente y pie.
 *
 * Es la misma hoja para receta, orden médica y referencia. Si cambias el
 * formato aquí, cambia en todos los documentos a la vez — que es justo el
 * punto: el consultorio tiene UN papel membretado, no tres.
 *
 * La configuración (qué se muestra, tamaño de hoja) vive en
 * Configuración → Receta y aplica a todos por igual.
 */
export type Letterhead = {
  cfg: TemplateConfig;
  logoUrl: string | null;
  clinicName: string;
  clinicAddress: string;
  clinicPhone: string;
  email: string;
  social: { website: string; facebook: string; instagram: string };
  doctorName: string;
  specialty: string;
  license: string;
  specialtyLicense: string;
  licenseLines: string[];
  ssaNumber: string;
  stateRegistration: string;
};

/**
 * Densidad del documento: ajusta el tamaño base del texto según cuánto
 * contenido hay que meter en la hoja.
 *
 * `dense` tiene un piso deliberado: una receta que no se puede leer no sirve.
 * Si el contenido no cabe ni así, es mejor que el navegador la parta en dos
 * páginas a que se encoja hasta volverse ilegible.
 */
export type Density = "normal" | "compact" | "dense";

const DENSITY_CLASSES: Record<Density, string> = {
  normal: "p-8 text-[12.5px] leading-relaxed",
  compact: "p-7 text-[11.5px] leading-normal",
  dense: "p-6 text-[10.5px] leading-snug",
};

/** Hoja de papel: ancho y alto mínimo según media hoja u hoja completa. */
export function DocumentPaper({
  paperSize,
  density = "normal",
  children,
}: {
  paperSize: "full" | "half";
  density?: Density;
  children: React.ReactNode;
}) {
  const half = paperSize === "half";
  return (
    <div
      className={`mx-auto flex w-full ${half ? "max-w-[540px]" : "max-w-[820px]"} ${
        DENSITY_CLASSES[density]
      } flex-col rounded-md border border-border bg-white text-slate-800 shadow-sm print:rounded-none print:border-0 print:shadow-none`}
      style={{ minHeight: half ? 520 : 960 }}
    >
      {children}
    </div>
  );
}

/** Encabezado a dos columnas: consultorio a la izquierda, médico a la derecha. */
export function DocumentHeader({ lh }: { lh: Letterhead }) {
  const { cfg } = lh;
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        {cfg.header.showLogo &&
          (lh.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={lh.logoUrl} alt="" className="mb-1.5 block h-14 w-auto max-w-[180px] object-contain object-left" />
          ) : (
            <div className="mb-1 inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-[9px] text-slate-400">
              LOGO
            </div>
          ))}
        {cfg.header.showClinicName && (
          <div className="text-xl font-bold leading-tight text-slate-900">{lh.clinicName}</div>
        )}
        {cfg.header.showSpecialty && lh.specialty && (
          <div className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-500">{lh.specialty}</div>
        )}
      </div>
      <div className="shrink-0 text-right">
        {cfg.header.showDoctorName && <div className="font-semibold text-slate-900">{lh.doctorName}</div>}
        {(cfg.header.showLicense || cfg.header.showSpecialtyLicense) && lh.licenseLines.length > 0 ? (
          lh.licenseLines.map((line, i) => (
            <div key={i} className="text-xs text-slate-500">
              {line}
            </div>
          ))
        ) : (
          <>
            {cfg.header.showLicense && lh.license && (
              <div className="text-xs text-slate-500">Cédula profesional {lh.license}</div>
            )}
            {cfg.header.showSpecialtyLicense && lh.specialtyLicense && (
              <div className="text-xs text-slate-500">Cédula de especialidad {lh.specialtyLicense}</div>
            )}
          </>
        )}
        {lh.ssaNumber && <div className="text-xs text-slate-500">S.S.A. {lh.ssaNumber}</div>}
        {lh.stateRegistration && <div className="text-xs text-slate-500">Reg. Edo. {lh.stateRegistration}</div>}
        {cfg.header.showEmail && lh.email && <div className="mt-0.5 text-xs text-slate-500">{lh.email}</div>}
        {cfg.header.extraText && <div className="mt-0.5 text-xs italic text-slate-500">{cfg.header.extraText}</div>}
      </div>
    </div>
  );
}

/** Barra del paciente y fecha, con el tinte de la marca. */
export function PatientBar({
  patientName,
  dateStr,
  patientLabel = "Paciente",
}: {
  patientName: string;
  dateStr: string;
  patientLabel?: string;
}) {
  return (
    <div className="mt-6 flex items-center justify-between gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="shrink-0 text-slate-500">{patientLabel}</span>
        <span className="flex-1 truncate rounded bg-[#e8f1f4] px-3 py-1.5 font-medium text-slate-800">
          {patientName}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-slate-500">Fecha</span>
        <span className="rounded bg-[#e8f1f4] px-3 py-1.5">{dateStr}</span>
      </div>
    </div>
  );
}

/** Pie a dos columnas: contacto y redes a la izquierda, dirección a la derecha. */
export function DocumentFooter({ lh }: { lh: Letterhead }) {
  const { cfg, social } = lh;

  const contact = [
    cfg.footer.showPhone && lh.clinicPhone ? `Tel. ${lh.clinicPhone}` : "",
    cfg.footer.showWhatsapp && lh.clinicPhone ? `WhatsApp ${lh.clinicPhone}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const networks = [
    cfg.footer.showWebsite && social.website ? social.website : "",
    social.facebook ? `FB ${social.facebook}` : "",
    social.instagram ? `IG ${social.instagram}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    // Ambas columnas parten palabras y comparten el ancho: con una dirección
    // larga, `shrink-0` hacía que se encimara sobre el contacto.
    <div className="mt-auto flex items-end justify-between gap-4 border-t border-slate-200 pt-3 text-[10px] leading-snug text-slate-500">
      <div className="min-w-0 flex-1 break-words">
        {contact && <div>{contact}</div>}
        {cfg.footer.showEmail && lh.email && <div className="break-all">{lh.email}</div>}
        {networks && <div className="break-all">{networks}</div>}
        {cfg.footer.customText && <div className="italic">{cfg.footer.customText}</div>}
      </div>
      {lh.clinicAddress && <div className="min-w-0 flex-1 break-words text-right">{lh.clinicAddress}</div>}
    </div>
  );
}
