-- AlterTable
ALTER TABLE "doctor_profiles" ADD COLUMN     "licenses_text" TEXT;

-- AlterTable
ALTER TABLE "prescription_items" ADD COLUMN     "active_ingredient" TEXT,
ADD COLUMN     "presentation" TEXT,
ADD COLUMN     "quantity_to_dispense" TEXT;
