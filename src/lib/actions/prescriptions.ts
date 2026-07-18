"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { assertPermission } from "@/lib/auth/rbac";
import { createPrescriptionSchema } from "@/lib/validations/prescription";
import { issuePrescription, cancelPrescription } from "@/lib/services/prescriptions";
import { sendNotification } from "@/lib/services/notifications";
import { db } from "@/lib/db";

/** Solo el médico puede emitir. Recibe hasta 5 medicamentos capturados como campos indexados desde el form. */
export async function issuePrescriptionAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.role, "ISSUE_PRESCRIPTION");

  const items = [];
  for (let i = 0; i < 10; i++) {
    const name = formData.get(`item_${i}_medicationName`);
    if (!name) continue;
    items.push({
      medicationName: String(name),
      activeIngredient: String(formData.get(`item_${i}_activeIngredient`) || ""),
      presentation: String(formData.get(`item_${i}_presentation`) || ""),
      quantityToDispense: String(formData.get(`item_${i}_quantityToDispense`) || ""),
      dose: String(formData.get(`item_${i}_dose`) || ""),
      frequency: String(formData.get(`item_${i}_frequency`) || ""),
      route: String(formData.get(`item_${i}_route`) || ""),
      duration: String(formData.get(`item_${i}_duration`) || ""),
      instructions: String(formData.get(`item_${i}_instructions`) || ""),
    });
  }

  const parsed = createPrescriptionSchema.parse({
    patientId: String(formData.get("patientId")),
    consultationId: String(formData.get("consultationId") || "") || undefined,
    diagnosisText: String(formData.get("diagnosisText") || ""),
    instructions: String(formData.get("instructions") || ""),
    recommendations: String(formData.get("recommendations") || ""),
    items,
  });

  const prescription = await issuePrescription(session.organizationId, session.userId, parsed);

  const patient = await db.patient.findUnique({ where: { id: parsed.patientId } });
  const doctor = await db.user.findUnique({ where: { id: session.userId } });
  if (patient?.email && doctor) {
    await sendNotification({
      organizationId: session.organizationId,
      type: "PRESCRIPTION_ISSUED",
      to: patient.email,
      subject: "Tu receta médica",
      template: "prescriptionIssued",
      templateParams: { patientName: patient.firstName, doctorName: doctor.fullName, folio: prescription.folio },
      relatedEntity: "prescription",
      relatedId: prescription.id,
    });
  }

  if (parsed.consultationId) revalidatePath(`/consultations/${parsed.consultationId}`);
}

export async function cancelPrescriptionAction(prescriptionId: string) {
  const session = await requireSession();
  assertPermission(session.role, "CANCEL_PRESCRIPTION");
  await cancelPrescription(session.organizationId, session.userId, prescriptionId);
  revalidatePath(`/prescriptions/${prescriptionId}`);
}
