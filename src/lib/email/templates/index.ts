type TemplateParams = Record<string, string>;

const wrap = (title: string, body: string) => `
<!DOCTYPE html>
<html lang="es">
  <body style="font-family: Arial, sans-serif; background:#f4f5f7; padding:24px;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;">
      <h2 style="color:#111827;margin-top:0;">${title}</h2>
      <div style="color:#374151;font-size:14px;line-height:1.6;">${body}</div>
      <p style="color:#9ca3af;font-size:12px;margin-top:32px;">Este es un mensaje automático, por favor no respondas a este correo.</p>
    </div>
  </body>
</html>`;

export const templates = {
  appointmentConfirmation: (p: TemplateParams) =>
    wrap(
      "Confirmación de cita",
      `Hola ${p.patientName}, tu cita con ${p.doctorName} quedó agendada para el <b>${p.date}</b> a las <b>${p.time}</b>. Si necesitas reprogramar, contáctanos.`
    ),
  appointmentReminder: (p: TemplateParams) =>
    wrap(
      "Recordatorio de cita",
      `Hola ${p.patientName}, te recordamos tu cita con ${p.doctorName} el <b>${p.date}</b> a las <b>${p.time}</b>.`
    ),
  appointmentCancellation: (p: TemplateParams) =>
    wrap("Cita cancelada", `Hola ${p.patientName}, tu cita del <b>${p.date}</b> ha sido cancelada. ${p.reason ?? ""}`),
  appointmentReschedule: (p: TemplateParams) =>
    wrap(
      "Cita reprogramada",
      `Hola ${p.patientName}, tu cita fue reprogramada para el <b>${p.date}</b> a las <b>${p.time}</b>.`
    ),
  preRegistrationLink: (p: TemplateParams) =>
    wrap(
      "Completa tu registro",
      `Hola ${p.patientName}, por favor completa tus datos antes de tu cita usando este enlace seguro: <a href="${p.link}">${p.link}</a>. El enlace vence el ${p.expiresAt}.`
    ),
  prescriptionIssued: (p: TemplateParams) =>
    wrap("Tu receta médica", `Hola ${p.patientName}, adjuntamos tu receta emitida por ${p.doctorName}. Folio: ${p.folio}.`),
  medicalOrderIssued: (p: TemplateParams) =>
    wrap("Tu orden médica", `Hola ${p.patientName}, adjuntamos tu orden médica emitida por ${p.doctorName}. Folio: ${p.folio}.`),
  referralReceived: (p: TemplateParams) =>
    wrap(
      "Nueva referencia médica",
      `Dr(a). ${p.toDoctorName}, ha recibido una referencia de ${p.fromDoctorName} (${p.fromOrganization}) para el paciente ${p.patientLabel}. Motivo: ${p.reason}.`
    ),
  referralAccepted: (p: TemplateParams) =>
    wrap("Referencia aceptada", `Dr(a). ${p.fromDoctorName}, su referencia para ${p.patientLabel} fue aceptada por ${p.toDoctorName}.`),
  referralRejected: (p: TemplateParams) =>
    wrap("Referencia rechazada", `Dr(a). ${p.fromDoctorName}, su referencia para ${p.patientLabel} fue rechazada por ${p.toDoctorName}.`),
  accountActivation: (p: TemplateParams) =>
    wrap("Activa tu cuenta", `Hola ${p.fullName}, activa tu cuenta usando este enlace: <a href="${p.link}">${p.link}</a>`),
  passwordReset: (p: TemplateParams) =>
    wrap("Recuperación de contraseña", `Hola ${p.fullName}, restablece tu contraseña aquí: <a href="${p.link}">${p.link}</a>`),
  followUpReminder: (p: TemplateParams) =>
    wrap("Recordatorio de seguimiento", `Hola ${p.patientName}, tienes un seguimiento programado el ${p.date} con ${p.doctorName}.`),
};
