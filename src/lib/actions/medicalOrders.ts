"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { assertPermission } from "@/lib/auth/rbac";
import { createMedicalOrderSchema } from "@/lib/validations/medicalOrder";
import { issueMedicalOrder } from "@/lib/services/medicalOrders";
import { sendNotification } from "@/lib/services/notifications";
import { db } from "@/lib/db";

export async function issueMedicalOrderAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.role, "ISSUE_MEDICAL_ORDER");

  // "N/A": si no se eligió un tipo de orden, no se emite nada.
  const rawType = String(formData.get("type") || "");
  if (!rawType) {
    const cid = String(formData.get("consultationId") || "");
    if (cid) revalidatePath(`/consultations/${cid}`);
    return;
  }

  const items = [];
  for (let i = 0; i < 10; i++) {
    const study = formData.get(`item_${i}_studyName`);
    if (!study) continue;
    items.push({ studyName: String(study), notes: String(formData.get(`item_${i}_notes`) || "") });
  }

  const parsed = createMedicalOrderSchema.parse({
    patientId: String(formData.get("patientId")),
    consultationId: String(formData.get("consultationId") || "") || undefined,
    type: String(formData.get("type")),
    reason: String(formData.get("reason") || ""),
    diagnosisText: String(formData.get("diagnosisText") || ""),
    instructions: String(formData.get("instructions") || ""),
    priority: String(formData.get("priority") || "ROUTINE"),
    items,
  });

  const order = await issueMedicalOrder(session.organizationId, session.userId, parsed);

  const patient = await db.patient.findUnique({ where: { id: parsed.patientId } });
  const doctor = await db.user.findUnique({ where: { id: session.userId } });
  if (patient?.email && doctor) {
    await sendNotification({
      organizationId: session.organizationId,
      type: "MEDICAL_ORDER_ISSUED",
      to: patient.email,
      subject: "Tu orden médica",
      template: "medicalOrderIssued",
      templateParams: { patientName: patient.firstName, doctorName: doctor.fullName, folio: order.folio },
      relatedEntity: "medical_order",
      relatedId: order.id,
    });
  }

  if (parsed.consultationId) revalidatePath(`/consultations/${parsed.consultationId}`);
}
