-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('BOT', 'NEEDS_HUMAN', 'WAITING_PATIENT', 'RESOLVED');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('SIMULATOR', 'WHATSAPP');

-- CreateTable
CREATE TABLE "conversation_sessions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL DEFAULT 'SIMULATOR',
    "patient_id" TEXT,
    "status" "ConversationStatus" NOT NULL DEFAULT 'BOT',
    "state_json" JSONB,
    "last_intent" TEXT,
    "escalated_at" TIMESTAMP(3),
    "escalation_note" TEXT,
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_messages" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "body" TEXT NOT NULL,
    "options_json" JSONB,
    "external_id" TEXT,
    "delivery_status" TEXT,
    "error_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversation_sessions_organization_id_status_idx" ON "conversation_sessions"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_sessions_organization_id_phone_channel_key" ON "conversation_sessions"("organization_id", "phone", "channel");

-- CreateIndex
CREATE INDEX "conversation_messages_session_id_created_at_idx" ON "conversation_messages"("session_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_messages_external_id_key" ON "conversation_messages"("external_id");

-- AddForeignKey
ALTER TABLE "conversation_sessions" ADD CONSTRAINT "conversation_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_sessions" ADD CONSTRAINT "conversation_sessions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "conversation_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
