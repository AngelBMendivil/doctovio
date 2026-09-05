-- Odontograma: bitacora de hallazgos y tratamientos por diente.
--
-- Migracion ADITIVA: crea enums y una tabla nueva. No toca nada existente.
--
-- Solo la usan los consultorios con type = DENTAL, pero la tabla vive en el
-- esquema comun: separarla por tipo de consultorio obligaria a dos esquemas y
-- Doctovio es UNA plataforma. El tipo decide que se MUESTRA, no que existe.

-- CreateEnum
CREATE TYPE "ToothSurface" AS ENUM ('VESTIBULAR', 'PALATAL_LINGUAL', 'MESIAL', 'DISTAL', 'OCCLUSAL_INCISAL', 'WHOLE');

-- CreateEnum
CREATE TYPE "OdontogramEntryKind" AS ENUM ('FINDING', 'TREATMENT');

-- CreateEnum
CREATE TYPE "OdontogramEntryStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "odontogram_entries" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "tooth_code" TEXT NOT NULL,
    "surfaces" "ToothSurface"[],
    "kind" "OdontogramEntryKind" NOT NULL,
    "code" TEXT NOT NULL,
    "status" "OdontogramEntryStatus" NOT NULL DEFAULT 'COMPLETED',
    "notes" TEXT,
    "consultation_id" TEXT,
    "doctor_id" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "odontogram_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- La consulta mas comun: todo el odontograma de un paciente.
CREATE INDEX "odontogram_entries_organization_id_patient_id_idx" ON "odontogram_entries"("organization_id", "patient_id");
-- La segunda: la historia de UNA pieza, en orden.
CREATE INDEX "odontogram_entries_patient_id_tooth_code_recorded_at_idx" ON "odontogram_entries"("patient_id", "tooth_code", "recorded_at");

-- AddForeignKey
ALTER TABLE "odontogram_entries" ADD CONSTRAINT "odontogram_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "odontogram_entries" ADD CONSTRAINT "odontogram_entries_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "odontogram_entries" ADD CONSTRAINT "odontogram_entries_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "odontogram_entries" ADD CONSTRAINT "odontogram_entries_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
