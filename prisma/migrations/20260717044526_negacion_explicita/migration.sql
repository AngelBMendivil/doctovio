-- AlterTable
ALTER TABLE "medical_histories" ADD COLUMN     "family_negated" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "medical_profiles" ADD COLUMN     "allergies_negated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "chronic_negated" BOOLEAN NOT NULL DEFAULT false;
