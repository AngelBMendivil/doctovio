-- CreateEnum
CREATE TYPE "InsuranceAuthStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'REQUESTED', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "patient_insurances" ADD COLUMN     "authorization_number" TEXT,
ADD COLUMN     "authorization_status" "InsuranceAuthStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN     "checklist_json" JSONB,
ADD COLUMN     "insurer_id" TEXT;

-- CreateTable
CREATE TABLE "insurers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "requires_pre_authorization" BOOLEAN NOT NULL DEFAULT false,
    "authorization_instructions" TEXT,
    "required_documents" TEXT,
    "protocol_notes" TEXT,
    "coverage_notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "insurers_organization_id_idx" ON "insurers"("organization_id");

-- CreateIndex
CREATE INDEX "patient_insurances_insurer_id_idx" ON "patient_insurances"("insurer_id");

-- AddForeignKey
ALTER TABLE "patient_insurances" ADD CONSTRAINT "patient_insurances_insurer_id_fkey" FOREIGN KEY ("insurer_id") REFERENCES "insurers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurers" ADD CONSTRAINT "insurers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
