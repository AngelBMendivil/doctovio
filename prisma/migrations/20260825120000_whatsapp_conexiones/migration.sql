-- Enrutamiento de WhatsApp por consultorio.
--
-- Migración ADITIVA: crea una tabla nueva y no toca ninguna existente.
-- No borra ni modifica datos. Es reversible con un DROP TABLE.
--
-- El índice único (provider, instance_id) es el que vuelve imposible que un
-- mismo número de WhatsApp resuelva a dos consultorios distintos.

-- CreateTable
CREATE TABLE "whatsapp_connections" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'META',
    "instance_id" TEXT NOT NULL,
    "phone_number" TEXT,
    "access_token" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_connections_organization_id_idx" ON "whatsapp_connections"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_connections_provider_instance_id_key" ON "whatsapp_connections"("provider", "instance_id");

-- AddForeignKey
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
