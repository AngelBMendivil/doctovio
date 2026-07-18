import "server-only";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

/**
 * Cliente de almacenamiento de objetos. Cloudflare R2 es compatible con la
 * API de S3, por lo que se usa el SDK oficial de AWS apuntando al endpoint
 * de R2. Alternativas equivalentes: Amazon S3, Supabase Storage (también
 * S3-compatible).
 *
 * REGLA DE NEGOCIO: PostgreSQL nunca almacena el binario del archivo, solo
 * metadata (ver modelo FileAsset / PatientDocument). El binario vive
 * exclusivamente en el bucket de objetos.
 */
const s3 = new S3Client({
  region: process.env.STORAGE_REGION || "auto",
  endpoint: process.env.STORAGE_ENDPOINT,
  credentials: {
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY || "",
  },
});

const BUCKET = process.env.STORAGE_BUCKET || "mvp-pacientes-documentos";

const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
const MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

export function validateUpload(mimeType: string, sizeBytes: number) {
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new Error(`Tipo de archivo no permitido: ${mimeType}. Solo PDF, JPG, JPEG o PNG.`);
  }
  if (sizeBytes > MAX_SIZE_BYTES) {
    throw new Error("El archivo excede el tamaño máximo permitido (15 MB).");
  }
}

/** Genera una clave de almacenamiento aislada por organización. */
export function buildStorageKey(organizationId: string, fileName: string) {
  const ext = fileName.split(".").pop();
  return `org/${organizationId}/documents/${randomUUID()}.${ext}`;
}

export async function uploadObject(params: { key: string; body: Buffer; mimeType: string }) {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: params.key,
      Body: params.body,
      ContentType: params.mimeType,
    })
  );
}

/** URL firmada y temporal para lectura (por defecto 5 minutos). */
export async function getSignedDownloadUrl(key: string, expiresInSeconds = 300) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
}

/** URL firmada para subida directa desde el navegador (evita pasar el binario por el servidor Next.js). */
export async function getSignedUploadUrl(key: string, mimeType: string, expiresInSeconds = 300) {
  const command = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: mimeType });
  return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
}

export async function deleteObject(key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
