"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { assertPermission } from "@/lib/auth/rbac";
import { uploadPatientDocument, getDocumentDownloadUrl } from "@/lib/services/documents";
import type { DocumentCategory, PrivacyLevel } from "@prisma/client";

export async function uploadDocumentAction(formData: FormData) {
  const session = await requireSession();

  const category = String(formData.get("category") || "OTHER") as DocumentCategory;
  const isClinical = ["LAB_RESULT", "IMAGING", "EXTERNAL_PRESCRIPTION", "CLINICAL_PHOTO"].includes(category);
  assertPermission(session.role, isClinical ? "UPLOAD_CLINICAL_DOCUMENT" : "UPLOAD_ADMIN_DOCUMENT");

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("Selecciona un archivo.");

  const buffer = Buffer.from(await file.arrayBuffer());
  const patientId = String(formData.get("patientId"));

  await uploadPatientDocument({
    organizationId: session.organizationId,
    patientId,
    uploadedById: session.userId,
    fileName: file.name,
    mimeType: file.type,
    fileBuffer: buffer,
    category,
    privacyLevel: (String(formData.get("privacyLevel") || "GENERAL") as PrivacyLevel),
    description: String(formData.get("description") || ""),
  });

  revalidatePath(`/patients/${patientId}`);
}

export async function getDocumentUrlAction(documentId: string) {
  const session = await requireSession();
  return getDocumentDownloadUrl(session.organizationId, session.userId, documentId);
}
