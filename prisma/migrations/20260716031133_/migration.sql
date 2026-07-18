-- CreateEnum
CREATE TYPE "PaymentOrigin" AS ENUM ('PRIVATE', 'INSURANCE');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "insurer_id" TEXT,
ADD COLUMN     "insurer_name" TEXT,
ADD COLUMN     "origin" "PaymentOrigin" NOT NULL DEFAULT 'PRIVATE';

-- CreateIndex
CREATE INDEX "payments_organization_id_origin_idx" ON "payments"("organization_id", "origin");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_insurer_id_fkey" FOREIGN KEY ("insurer_id") REFERENCES "insurers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
