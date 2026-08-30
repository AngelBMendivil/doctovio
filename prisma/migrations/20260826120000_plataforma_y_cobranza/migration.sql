-- Operador de plataforma (usuario maestro) y cobranza de consultorios.
--
-- Migración ADITIVA: solo agrega columnas con default y una tabla nueva.
-- No borra ni modifica datos existentes.
--
-- El backfill del final es lo único que toca filas: pone status = ACTIVE en los
-- consultorios que hoy están activos, para que `status` e `is_active` arranquen
-- coherentes. Sin eso todos quedarían en TRIAL (el default) y el panel
-- mostraría a un cliente que ya paga como si estuviera en prueba.

-- CreateEnum
CREATE TYPE "ClinicType" AS ENUM ('MEDICAL', 'DENTAL');

-- CreateEnum
CREATE TYPE "ClinicStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED');

-- AlterTable
ALTER TABLE "organizations"
  ADD COLUMN "type"            "ClinicType"   NOT NULL DEFAULT 'MEDICAL',
  ADD COLUMN "status"          "ClinicStatus" NOT NULL DEFAULT 'TRIAL',
  ADD COLUMN "max_users"       INTEGER        NOT NULL DEFAULT 3,
  ADD COLUMN "plan_name"       TEXT,
  ADD COLUMN "monthly_fee_mxn" DOUBLE PRECISION,
  ADD COLUMN "paid_until"      TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users"
  ADD COLUMN "is_platform_admin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "clinic_payments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'TRANSFER',
    "reference" TEXT,
    "notes" TEXT,
    "registered_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinic_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clinic_payments_organization_id_period_end_idx" ON "clinic_payments"("organization_id", "period_end");

-- CreateIndex
CREATE INDEX "organizations_status_idx" ON "organizations"("status");

-- AddForeignKey
ALTER TABLE "clinic_payments" ADD CONSTRAINT "clinic_payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: alinear status con is_active, que hasta hoy era la única verdad.
UPDATE "organizations" SET "status" = 'ACTIVE'    WHERE "is_active" = true;
UPDATE "organizations" SET "status" = 'SUSPENDED' WHERE "is_active" = false;
