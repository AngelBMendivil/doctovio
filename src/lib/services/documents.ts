import { db } from "@/lib/db";
import { logAudit } from "@/lib/services/audit";
import { validateUpload, buildStorageKey, uploadObject, getSignedDownloadUrl } from "@/lib/storage/r2";
import type { DocumentCategory, PrivacyLevel } from "@prisma/client";

type UploadDocumentParams = {
  organizationId: string;
  patientId: string;
  consultationId?: string;
  uploadedById: string;
  fileName: string;
  mimeType: string;
  fileBuffer: Buffer;
  category: DocumentCategory;
  privacyLevel: PrivacyLevel;
  description?: string;
  documentDate?: Date;
};

export async function uploadPatientDocument(params: UploadDocumentParams) {
  validateUpload(params.mimeType, params.fileBuffer.byteLength);
  const key = buildStorageKey(params.organizationId, params.fileName);
  await uploadObject({ key, body: params.fileBuffer, mimeType: params.mimeType });

  const document = await db.$transaction(async (tx) => {
    const asset = await tx.fileAsset.create({
      data: {
        organizationId: params.organizationId,
        storageKey: key,
        fileName: params.fileName,
        mimeType: params.mimeType,
        sizeBytes: params.fileBuffer.byteLength,
      },
    });
    return tx.patientDocument.create({
      data: {
        organizationId: params.organizationId,
        patientId: params.patientId,
        consultationId: params.consultationId,
        fileAssetId: asset.id,
        name: params.fileName,
        category: params.category,
        documentDate: params.documentDate,
        description: params.description,
        privacyLevel: params.privacyLevel,
        uploadedById: params.uploadedById,
      },
      include: { fileAsset: true },
    });
  });

  await logAudit({
    organizationId: params.organizationId,
    userId: params.uploadedById,
    action: "UPLOAD",
    entity: "patient_document",
    entityId: document.id,
    newValues: { name: document.name, category: document.category },
  });

  return document;
}

/** Genera una URL firmada temporal para ver/descargar el documento, y deja rastro en auditoría. */
export async function getDocumentDownloadUrl(organizationId: string, userId: string, documentId: string) {
  const document = await db.patientDocument.findFirstOrThrow({
    where: { id: documentId, organizationId },
    include: { fileAsset: true },
  });

  const url = await getSignedDownloadUrl(document.fileAsset.storageKey, 300);

  await logAudit({ organizationId, userId, action: "DOWNLOAD", entity: "patient_document", entityId: documentId });

  return url;
}

export async function listPatientDocuments(organizationId: string, patientId: string) {
  return db.patientDocument.findMany({
    where: { organizationId, patientId, status: "ACTIVE" },
    include: { fileAsset: true },
    orderBy: { uploadedAt: "desc" },
  });
}
