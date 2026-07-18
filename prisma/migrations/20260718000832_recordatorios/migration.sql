-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED', 'SKIPPED');

-- CreateTable
CREATE TABLE "reminder_jobs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "hours_before" INTEGER NOT NULL,
    "send_at" TIMESTAMP(3) NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "sent_at" TIMESTAMP(3),
    "external_id" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminder_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reminder_jobs_status_send_at_idx" ON "reminder_jobs"("status", "send_at");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_jobs_appointment_id_hours_before_key" ON "reminder_jobs"("appointment_id", "hours_before");

-- AddForeignKey
ALTER TABLE "reminder_jobs" ADD CONSTRAINT "reminder_jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_jobs" ADD CONSTRAINT "reminder_jobs_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
