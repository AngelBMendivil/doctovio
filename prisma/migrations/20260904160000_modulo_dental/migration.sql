-- MODULO DENTAL: catalogo del consultorio, plan de tratamiento y cotizaciones.
--
-- Migracion ADITIVA. Crea enums y tablas nuevas, y agrega UNA columna anulable
-- a patient_documents. No renombra, no borra, no cambia tipos ni constraints.
-- Un consultorio existente que nunca abra el modulo no nota diferencia: las
-- tablas quedan vacias y ninguna consulta del core las lee.

-- CreateEnum
CREATE TYPE "CatalogItemType" AS ENUM ('SERVICE', 'PRODUCT');

-- CreateEnum
CREATE TYPE "TreatmentStatus" AS ENUM ('PENDING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
-- Sin 'EXPIRED' a proposito: vencida se DERIVA de valid_until.
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'PARTIAL', 'CANCELLED');

-- CreateTable
CREATE TABLE "catalog_categories" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_items" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "CatalogItemType" NOT NULL DEFAULT 'SERVICE',
    "category_id" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "tax_rate" DOUBLE PRECISION,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_plan_items" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "tooth_code" TEXT,
    "surfaces" "ToothSurface"[],
    "diagnosis" TEXT,
    "treatment_code" TEXT NOT NULL,
    "catalog_item_id" TEXT,
    "item_name" TEXT NOT NULL,
    "list_price" DOUBLE PRECISION,
    "unit_price" DOUBLE PRECISION NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "TreatmentStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "finding_entry_id" TEXT,
    "result_entry_id" TEXT,
    "consultation_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "completed_by_id" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treatment_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMP(3),
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "notes" TEXT,
    "terms" TEXT,
    "created_by_id" TEXT NOT NULL,
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_items" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "catalog_item_id" TEXT,
    "treatment_plan_item_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tooth_code" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price" DOUBLE PRECISION NOT NULL,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax_rate" DOUBLE PRECISION,
    "total" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id")
);

-- AlterTable
-- Anulable y sin default: los documentos existentes quedan exactamente igual.
ALTER TABLE "patient_documents" ADD COLUMN "tooth_code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "catalog_categories_organization_id_name_key" ON "catalog_categories"("organization_id", "name");
CREATE INDEX "catalog_categories_organization_id_idx" ON "catalog_categories"("organization_id");
CREATE UNIQUE INDEX "catalog_items_organization_id_code_key" ON "catalog_items"("organization_id", "code");
CREATE INDEX "catalog_items_organization_id_is_active_idx" ON "catalog_items"("organization_id", "is_active");
CREATE INDEX "catalog_items_organization_id_type_idx" ON "catalog_items"("organization_id", "type");
CREATE UNIQUE INDEX "treatment_plan_items_result_entry_id_key" ON "treatment_plan_items"("result_entry_id");
CREATE INDEX "treatment_plan_items_organization_id_patient_id_status_idx" ON "treatment_plan_items"("organization_id", "patient_id", "status");
CREATE INDEX "treatment_plan_items_patient_id_tooth_code_idx" ON "treatment_plan_items"("patient_id", "tooth_code");
-- El folio es consecutivo POR CONSULTORIO: dos clinicas pueden tener su COT-000001.
CREATE UNIQUE INDEX "quotes_organization_id_folio_key" ON "quotes"("organization_id", "folio");
CREATE INDEX "quotes_organization_id_patient_id_idx" ON "quotes"("organization_id", "patient_id");
CREATE INDEX "quotes_organization_id_status_idx" ON "quotes"("organization_id", "status");
CREATE INDEX "quote_items_quote_id_idx" ON "quote_items"("quote_id");
CREATE INDEX "quote_items_treatment_plan_item_id_idx" ON "quote_items"("treatment_plan_item_id");

-- AddForeignKey
ALTER TABLE "catalog_categories" ADD CONSTRAINT "catalog_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "catalog_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "treatment_plan_items" ADD CONSTRAINT "treatment_plan_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "treatment_plan_items" ADD CONSTRAINT "treatment_plan_items_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "treatment_plan_items" ADD CONSTRAINT "treatment_plan_items_catalog_item_id_fkey" FOREIGN KEY ("catalog_item_id") REFERENCES "catalog_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "treatment_plan_items" ADD CONSTRAINT "treatment_plan_items_finding_entry_id_fkey" FOREIGN KEY ("finding_entry_id") REFERENCES "odontogram_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "treatment_plan_items" ADD CONSTRAINT "treatment_plan_items_result_entry_id_fkey" FOREIGN KEY ("result_entry_id") REFERENCES "odontogram_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "treatment_plan_items" ADD CONSTRAINT "treatment_plan_items_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "treatment_plan_items" ADD CONSTRAINT "treatment_plan_items_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "treatment_plan_items" ADD CONSTRAINT "treatment_plan_items_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Los conceptos mueren con su cotizacion: no significan nada sueltos.
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_catalog_item_id_fkey" FOREIGN KEY ("catalog_item_id") REFERENCES "catalog_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_treatment_plan_item_id_fkey" FOREIGN KEY ("treatment_plan_item_id") REFERENCES "treatment_plan_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
