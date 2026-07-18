/*
  Warnings:

  - A unique constraint covering the columns `[organization_id,folio]` on the table `appointments` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('NOT_LINKED', 'SYNCED', 'PENDING', 'IN_PROGRESS', 'TEMP_ERROR', 'PERMANENT_ERROR', 'CONFLICT');

-- CreateEnum
CREATE TYPE "BlockKind" AS ENUM ('MANUAL', 'LUNCH', 'VACATION', 'EXTERNAL_CALENDAR');

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "cancellation_reason" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "confirmed_at" TIMESTAMP(3),
ADD COLUMN     "confirmed_by" TEXT,
ADD COLUMN     "folio" TEXT,
ADD COLUMN     "google_calendar_id" TEXT,
ADD COLUMN     "google_event_id" TEXT,
ADD COLUMN     "last_synced_at" TIMESTAMP(3),
ADD COLUMN     "sync_error" TEXT,
ADD COLUMN     "sync_status" "SyncStatus" NOT NULL DEFAULT 'NOT_LINKED',
ADD COLUMN     "updated_by_id" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "whatsapp_phone" TEXT;

-- AlterTable
ALTER TABLE "organization_settings" ADD COLUMN     "buffer_minutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cancel_min_hours" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "hold_minutes" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "max_advance_days" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "min_lead_minutes" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "reminder_hours_before" INTEGER[] DEFAULT ARRAY[24]::INTEGER[],
ADD COLUMN     "slot_granularity_min" INTEGER NOT NULL DEFAULT 15;

-- CreateTable
CREATE TABLE "doctor_schedules" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "doctor_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "weekday" INTEGER NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_blocks" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "doctor_id" TEXT NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "kind" "BlockKind" NOT NULL DEFAULT 'MANUAL',
    "reason" TEXT,
    "google_event_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_holds" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "doctor_id" TEXT NOT NULL,
    "patient_id" TEXT,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "session_key" TEXT,
    "consumed_at" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_holds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "doctor_schedules_organization_id_doctor_id_weekday_idx" ON "doctor_schedules"("organization_id", "doctor_id", "weekday");

-- CreateIndex
CREATE INDEX "schedule_blocks_organization_id_doctor_id_start_at_idx" ON "schedule_blocks"("organization_id", "doctor_id", "start_at");

-- CreateIndex
CREATE INDEX "appointment_holds_organization_id_doctor_id_start_at_idx" ON "appointment_holds"("organization_id", "doctor_id", "start_at");

-- CreateIndex
CREATE INDEX "appointment_holds_expires_at_idx" ON "appointment_holds"("expires_at");

-- CreateIndex
CREATE INDEX "appointments_organization_id_doctor_id_start_time_idx" ON "appointments"("organization_id", "doctor_id", "start_time");

-- CreateIndex
CREATE INDEX "appointments_sync_status_idx" ON "appointments"("sync_status");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_organization_id_folio_key" ON "appointments"("organization_id", "folio");

-- AddForeignKey
ALTER TABLE "doctor_schedules" ADD CONSTRAINT "doctor_schedules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_schedules" ADD CONSTRAINT "doctor_schedules_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_schedules" ADD CONSTRAINT "doctor_schedules_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_blocks" ADD CONSTRAINT "schedule_blocks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_blocks" ADD CONSTRAINT "schedule_blocks_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_holds" ADD CONSTRAINT "appointment_holds_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_holds" ADD CONSTRAINT "appointment_holds_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
