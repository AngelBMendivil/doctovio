-- Catálogo de productos, suscripciones, mensualidades y relación usuario↔consultorio.
--
-- Migración ADITIVA salvo por un cambio: audit_logs.organization_id pasa a
-- aceptar NULO. Eso es RELAJAR una restricción, no endurecerla, así que ningún
-- dato existente se invalida y ninguna consulta actual se rompe.
--
-- No borra ni modifica ninguna fila existente. Al final se siembra el producto
-- DOCTOVIO_BASE, y se le crea suscripción a los consultorios que ya existen
-- para que no queden fuera de la cobranza desde el arranque.

-- CreateEnum
CREATE TYPE "BillingFrequency" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillingCycleStatus" AS ENUM ('PENDING', 'PAID', 'PARTIAL', 'WAIVED');

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "billing_frequency" "BillingFrequency" NOT NULL DEFAULT 'MONTHLY',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_code_key" ON "products"("code");

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "billing_frequency" "BillingFrequency" NOT NULL DEFAULT 'MONTHLY',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "started_at" TIMESTAMP(3) NOT NULL,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscriptions_organization_id_idx" ON "subscriptions"("organization_id");
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateTable
CREATE TABLE "billing_cycles" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "due_date" TIMESTAMP(3) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "paid_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "BillingCycleStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Este único es lo que hace idempotente la generación de mensualidades:
-- correrla dos veces el mismo mes no duplica el cobro.
CREATE UNIQUE INDEX "billing_cycles_subscription_id_period_key" ON "billing_cycles"("subscription_id", "period");
CREATE INDEX "billing_cycles_organization_id_due_date_idx" ON "billing_cycles"("organization_id", "due_date");
CREATE INDEX "billing_cycles_status_due_date_idx" ON "billing_cycles"("status", "due_date");

-- CreateTable
CREATE TABLE "clinic_users" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "UserRoleName" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clinic_users_organization_id_user_id_key" ON "clinic_users"("organization_id", "user_id");
CREATE INDEX "clinic_users_user_id_idx" ON "clinic_users"("user_id");

-- AlterTable
ALTER TABLE "clinic_payments" ADD COLUMN "billing_cycle_id" TEXT;
CREATE INDEX "clinic_payments_billing_cycle_id_idx" ON "clinic_payments"("billing_cycle_id");

-- AlterTable: acciones de plataforma que no pertenecen a ningún consultorio.
-- Relaja la restricción, no la endurece: nada existente se invalida.
ALTER TABLE "audit_logs" ALTER COLUMN "organization_id" DROP NOT NULL;
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_cycles" ADD CONSTRAINT "billing_cycles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_cycles" ADD CONSTRAINT "billing_cycles_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinic_users" ADD CONSTRAINT "clinic_users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinic_users" ADD CONSTRAINT "clinic_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinic_payments" ADD CONSTRAINT "clinic_payments_billing_cycle_id_fkey" FOREIGN KEY ("billing_cycle_id") REFERENCES "billing_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Producto base. El precio vive aquí y en ningún otro lugar: cambiarlo es
-- editar esta fila, no desplegar código.
INSERT INTO "products" ("id", "code", "name", "description", "price", "currency", "billing_frequency", "is_active", "created_at", "updated_at")
VALUES (
  'prod_doctovio_base',
  'DOCTOVIO_BASE',
  'Doctovio',
  'Expediente, agenda, recetas, cobros y asistente de WhatsApp. Incluye 3 usuarios.',
  20,
  'USD',
  'MONTHLY',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- Los consultorios que ya existen entran a la cobranza con el producto base,
-- para que no queden invisibles en el panel desde el primer día.
INSERT INTO "subscriptions" ("id", "organization_id", "product_id", "price", "currency", "billing_frequency", "status", "started_at", "created_at", "updated_at")
SELECT
  'sub_' || o."id",
  o."id",
  'prod_doctovio_base',
  20,
  'USD',
  'MONTHLY',
  'ACTIVE',
  o."created_at",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "organizations" o
WHERE o."status" IN ('TRIAL', 'ACTIVE');

-- Cada usuario existente queda ligado a su consultorio actual como primario.
-- User.organization_id se CONSERVA: es lo que lee la sesión hoy.
INSERT INTO "clinic_users" ("id", "organization_id", "user_id", "role", "status", "is_primary", "created_at", "updated_at")
SELECT
  'cu_' || u."id",
  u."organization_id",
  u."id",
  u."primary_role",
  u."status",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "users" u;
