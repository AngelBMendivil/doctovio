"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { assertPermission } from "@/lib/auth/rbac";
import { createAppointmentSchema, rescheduleAppointmentSchema, cancelAppointmentSchema } from "@/lib/validations/appointment";
import { createAppointment, changeAppointmentStatus, rescheduleAppointment } from "@/lib/services/appointments";
import { sendNotification } from "@/lib/services/notifications";
import { db } from "@/lib/db";

export async function createAppointmentAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.role, "MANAGE_APPOINTMENTS");

  const raw = Object.fromEntries(formData.entries());
  const scheduledDate = String(formData.get("scheduledDate") || "");
  const hour = String(formData.get("hour") || "00");
  const minute = String(formData.get("minute") || "00");
  const parsed = createAppointmentSchema.parse({
    ...raw,
    startTime: `${scheduledDate}T${hour}:${minute}:00`,
    allowOverbook: formData.get("allowOverbook") === "on",
  });

  const appointment = await createAppointment(session.organizationId, session.userId, parsed);

  const patient = await db.patient.findUnique({ where: { id: parsed.patientId } });
  const doctor = await db.user.findUnique({ where: { id: parsed.doctorId } });
  if (patient?.email && doctor) {
    await sendNotification({
      organizationId: session.organizationId,
      type: "APPOINTMENT_CONFIRMATION",
      to: patient.email,
      subject: "Confirmación de tu cita",
      template: "appointmentConfirmation",
      templateParams: {
        patientName: patient.firstName,
        doctorName: doctor.fullName,
        date: parsed.scheduledDate.toLocaleDateString("es-MX"),
        time: parsed.startTime.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
      },
      relatedEntity: "appointment",
      relatedId: appointment.id,
    });
  }

  revalidatePath("/appointments");
}

export async function confirmAppointmentAction(appointmentId: string) {
  const session = await requireSession();
  assertPermission(session.role, "MANAGE_APPOINTMENTS");
  await changeAppointmentStatus(session.organizationId, session.userId, appointmentId, "CONFIRMED");
  revalidatePath("/appointments");
}

export async function cancelAppointmentAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.role, "MANAGE_APPOINTMENTS");
  const parsed = cancelAppointmentSchema.parse(Object.fromEntries(formData.entries()));
  await changeAppointmentStatus(session.organizationId, session.userId, parsed.appointmentId, "CANCELLED", parsed.reason);
  revalidatePath("/appointments");
}

export async function markNoShowAction(appointmentId: string) {
  const session = await requireSession();
  assertPermission(session.role, "MANAGE_APPOINTMENTS");
  await changeAppointmentStatus(session.organizationId, session.userId, appointmentId, "NO_SHOW");
  revalidatePath("/appointments");
}

export async function rescheduleAppointmentAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.role, "MANAGE_APPOINTMENTS");
  const parsed = rescheduleAppointmentSchema.parse(Object.fromEntries(formData.entries()));
  await rescheduleAppointment(session.organizationId, session.userId, parsed);
  revalidatePath("/appointments");
}
