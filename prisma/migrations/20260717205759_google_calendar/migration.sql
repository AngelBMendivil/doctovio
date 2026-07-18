-- CreateTable
CREATE TABLE "google_calendar_connections" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "doctor_id" TEXT NOT NULL,
    "google_email" TEXT NOT NULL,
    "calendar_id" TEXT NOT NULL DEFAULT 'primary',
    "refresh_token" TEXT NOT NULL,
    "access_token" TEXT,
    "access_expires_at" TIMESTAMP(3),
    "sync_token" TEXT,
    "channel_id" TEXT,
    "resource_id" TEXT,
    "channel_expires_at" TIMESTAMP(3),
    "pull_busy" BOOLEAN NOT NULL DEFAULT true,
    "push_events" BOOLEAN NOT NULL DEFAULT true,
    "last_synced_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_calendar_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "google_calendar_connections_doctor_id_key" ON "google_calendar_connections"("doctor_id");

-- CreateIndex
CREATE INDEX "google_calendar_connections_organization_id_idx" ON "google_calendar_connections"("organization_id");

-- AddForeignKey
ALTER TABLE "google_calendar_connections" ADD CONSTRAINT "google_calendar_connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_calendar_connections" ADD CONSTRAINT "google_calendar_connections_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
