-- CreateEnum
CREATE TYPE "UserRoleName" AS ENUM ('ADMIN', 'DOCTOR', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PatientStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED', 'DECEASED', 'DUPLICATE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PatientSex" AS ENUM ('MALE', 'FEMALE', 'UNDETERMINED');

-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'FREE_UNION', 'OTHER');

-- CreateEnum
CREATE TYPE "PatientSourceType" AS ENUM ('PRIVATE', 'INSURANCE', 'COMPANY', 'AGREEMENT', 'DOCTOR_REFERRAL', 'RECOMMENDATION', 'SOCIAL_MEDIA', 'INTERNET', 'OTHER');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('PRIVACY_NOTICE', 'TREATMENT_CONSENT', 'DATA_SHARING', 'REFERRAL_AUTHORIZATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('CRITICAL_ALLERGY', 'CHRONIC_DISEASE', 'PERMANENT_MEDICATION', 'CARDIOVASCULAR_RISK', 'PREGNANCY', 'SPECIAL_CONDITION', 'OTHER');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('FIRST_TIME', 'FOLLOW_UP', 'EXISTING_PATIENT');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('TO_CONFIRM', 'CONFIRMED', 'ARRIVED', 'WAITING', 'IN_CONSULTATION', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED');

-- CreateEnum
CREATE TYPE "AppointmentChannel" AS ENUM ('PHONE', 'WHATSAPP', 'EMAIL', 'WALK_IN', 'WEBSITE', 'REFERRAL', 'OTHER');

-- CreateEnum
CREATE TYPE "VisitArrivalType" AS ENUM ('WITH_APPOINTMENT', 'WITHOUT_APPOINTMENT', 'UNSCHEDULED_FOLLOWUP', 'PRIORITY', 'ADMINISTRATIVE_URGENCY');

-- CreateEnum
CREATE TYPE "VisitPriority" AS ENUM ('NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('REGISTERED', 'WAITING', 'IN_TRIAGE', 'IN_CONSULTATION', 'COMPLETED', 'LEFT', 'RESCHEDULED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ConsultationType" AS ENUM ('GENERAL', 'FOLLOW_UP', 'SPECIALTY', 'URGENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ConsultationStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REOPENED');

-- CreateEnum
CREATE TYPE "DiagnosisType" AS ENUM ('PRESUMPTIVE', 'CONFIRMED', 'DIFFERENTIAL', 'CHRONIC', 'RESOLVED');

-- CreateEnum
CREATE TYPE "PrescriptionStatus" AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "MedicalOrderType" AS ENUM ('LAB', 'IMAGING', 'CLINICAL_STUDY', 'THERAPY', 'REFERRAL', 'PROCEDURE', 'OTHER');

-- CreateEnum
CREATE TYPE "MedicalOrderStatus" AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "MedicalOrderPriority" AS ENUM ('ROUTINE', 'URGENT', 'STAT');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('IDENTIFICATION', 'INSURANCE', 'POLICY', 'LAB_RESULT', 'IMAGING', 'EXTERNAL_PRESCRIPTION', 'REFERRAL', 'CONSENT', 'ADMINISTRATIVE', 'CLINICAL_PHOTO', 'OTHER');

-- CreateEnum
CREATE TYPE "PrivacyLevel" AS ENUM ('GENERAL', 'RESTRICTED', 'CONFIDENTIAL');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('DRAFT', 'SENT', 'RECEIVED', 'ACCEPTED', 'REJECTED', 'ATTENDED', 'CLOSED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReferralPriority" AS ENUM ('NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ACCOUNT_ACTIVATION', 'PASSWORD_RESET', 'APPOINTMENT_CONFIRMATION', 'APPOINTMENT_REMINDER', 'APPOINTMENT_CANCELLATION', 'APPOINTMENT_RESCHEDULE', 'PRE_REGISTRATION_LINK', 'PRESCRIPTION_ISSUED', 'MEDICAL_ORDER_ISSUED', 'REFERRAL_RECEIVED', 'REFERRAL_ACCEPTED', 'REFERRAL_REJECTED', 'FOLLOW_UP_REMINDER');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'RETRYING');

-- CreateEnum
CREATE TYPE "PublicFormTokenType" AS ENUM ('PRE_REGISTRATION', 'APPOINTMENT_CONFIRMATION', 'REFERRAL_AUTHORIZATION');

-- CreateEnum
CREATE TYPE "PublicFormTokenStatus" AS ENUM ('GENERATED', 'SENT', 'OPENED', 'STARTED', 'INCOMPLETE', 'SUBMITTED', 'REVIEWED', 'CONVERTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN', 'LOGOUT', 'VIEW_RECORD', 'CREATE', 'UPDATE', 'DELETE', 'SOFT_DELETE', 'DOWNLOAD', 'UPLOAD', 'PERMISSION_CHANGE', 'SEND');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legal_name" TEXT,
    "logo_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postal_code" TEXT,
    "country" TEXT DEFAULT 'MX',
    "phone" TEXT,
    "is_main" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_settings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "language" TEXT NOT NULL DEFAULT 'es',
    "default_appointment_minutes" INTEGER NOT NULL DEFAULT 30,
    "tolerance_minutes" INTEGER NOT NULL DEFAULT 10,
    "appointment_types_json" JSONB,
    "consultation_types_json" JSONB,
    "specialties_json" JSONB,
    "office_hours_json" JSONB,
    "privacy_notice_html" TEXT,
    "consent_templates_json" JSONB,
    "prescription_template_json" JSONB,
    "email_templates_json" JSONB,
    "whatsapp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "primary_role" "UserRoleName" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "doctor_profiles" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "specialty" TEXT,
    "subspecialty" TEXT,
    "license_number" TEXT,
    "specialty_license" TEXT,
    "signature_image_url" TEXT,
    "photo_url" TEXT,
    "bio" TEXT,
    "professional_phone" TEXT,
    "professional_email" TEXT,
    "modality" TEXT,
    "accepts_referrals" BOOLEAN NOT NULL DEFAULT true,
    "listed_in_directory" BOOLEAN NOT NULL DEFAULT true,
    "city" TEXT,
    "state" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "record_number" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name_1" TEXT NOT NULL,
    "last_name_2" TEXT,
    "birth_date" TIMESTAMP(3) NOT NULL,
    "sex" "PatientSex" NOT NULL,
    "gender" TEXT,
    "curp" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postal_code" TEXT,
    "country" TEXT DEFAULT 'MX',
    "occupation" TEXT,
    "marital_status" "MaritalStatus",
    "photo_url" TEXT,
    "admin_notes" TEXT,
    "status" "PatientStatus" NOT NULL DEFAULT 'ACTIVE',
    "possible_duplicate_of_id" TEXT,
    "admitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "discharged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_responsible_contacts" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "is_primary_contact" BOOLEAN NOT NULL DEFAULT false,
    "can_receive_notifications" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_responsible_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_emergency_contacts" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_emergency_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_sources" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "source_type" "PatientSourceType" NOT NULL,
    "referring_doctor_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_insurances" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "insurer_name" TEXT NOT NULL,
    "policy_number" TEXT,
    "affiliate_number" TEXT,
    "valid_from" TIMESTAMP(3),
    "valid_to" TIMESTAMP(3),
    "plan_type" TEXT,
    "document_asset_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_insurances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_consents" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "type" "ConsentType" NOT NULL,
    "status" "ConsentStatus" NOT NULL DEFAULT 'PENDING',
    "document_url" TEXT,
    "accepted_at" TIMESTAMP(3),
    "accepted_ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_alerts" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'MEDIUM',
    "description" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "patient_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_profiles" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "blood_type" TEXT,
    "is_pregnant" BOOLEAN,
    "has_disability" BOOLEAN,
    "disability_notes" TEXT,
    "attending_doctor_id" TEXT,
    "last_visit_at" TIMESTAMP(3),
    "next_appointment_at" TIMESTAMP(3),
    "relevant_conditions" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_histories" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "family_diabetes" BOOLEAN,
    "family_hypertension" BOOLEAN,
    "family_cancer" BOOLEAN,
    "family_heart_disease" BOOLEAN,
    "family_hereditary_disease" BOOLEAN,
    "family_others" TEXT,
    "prior_diseases" TEXT,
    "chronic_diseases_notes" TEXT,
    "surgeries_notes" TEXT,
    "hospitalizations_notes" TEXT,
    "fractures_notes" TEXT,
    "transfusions_notes" TEXT,
    "relevant_infections_notes" TEXT,
    "diet" TEXT,
    "exercise" TEXT,
    "smoking" TEXT,
    "alcohol" TEXT,
    "substance_use" TEXT,
    "housing" TEXT,
    "hygiene" TEXT,
    "occupation_exposure" TEXT,
    "menarche" TEXT,
    "menstrual_cycle" TEXT,
    "pregnancies" INTEGER,
    "deliveries" INTEGER,
    "c_sections" INTEGER,
    "abortions" INTEGER,
    "last_menstrual_period" TIMESTAMP(3),
    "contraceptive_method" TEXT,
    "is_menopausal" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "medical_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allergies" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "substance" TEXT NOT NULL,
    "reaction" TEXT,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'MEDIUM',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "allergies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chronic_conditions" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "diagnosed_at" TIMESTAMP(3),
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chronic_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "current_medications" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dose" TEXT,
    "frequency" TEXT,
    "reason" TEXT,
    "start_date" TIMESTAMP(3),
    "prescribed_by_id" TEXT,
    "prescribed_by_name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "current_medications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vaccinations" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "vaccine" TEXT NOT NULL,
    "applied_at" TIMESTAMP(3) NOT NULL,
    "dose_number" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vaccinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "patient_id" TEXT NOT NULL,
    "doctor_id" TEXT NOT NULL,
    "scheduled_date" TIMESTAMP(3) NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 30,
    "type" "AppointmentType" NOT NULL,
    "reason" TEXT,
    "channel" "AppointmentChannel" NOT NULL DEFAULT 'PHONE',
    "status" "AppointmentStatus" NOT NULL DEFAULT 'TO_CONFIRM',
    "notes" TEXT,
    "is_overbooked" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_status_history" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "from_status" "AppointmentStatus",
    "to_status" "AppointmentStatus" NOT NULL,
    "changed_by_id" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visits" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "patient_id" TEXT NOT NULL,
    "appointment_id" TEXT,
    "doctor_id" TEXT NOT NULL,
    "arrival_type" "VisitArrivalType" NOT NULL,
    "arrival_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "priority" "VisitPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "VisitStatus" NOT NULL DEFAULT 'REGISTERED',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "doctor_id" TEXT NOT NULL,
    "visit_id" TEXT NOT NULL,
    "appointment_id" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "start_time" TIMESTAMP(3),
    "end_time" TIMESTAMP(3),
    "type" "ConsultationType" NOT NULL DEFAULT 'GENERAL',
    "reason" TEXT,
    "current_illness" TEXT,
    "physical_exam" TEXT,
    "assessment" TEXT,
    "diagnosis_summary" TEXT,
    "plan" TEXT,
    "treatment" TEXT,
    "instructions" TEXT,
    "prognosis" TEXT,
    "follow_up" TEXT,
    "follow_up_date" TIMESTAMP(3),
    "observations" TEXT,
    "status" "ConsultationStatus" NOT NULL DEFAULT 'DRAFT',
    "finalized_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultation_notes" (
    "id" TEXT NOT NULL,
    "consultation_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "is_addendum" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consultation_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vital_signs" (
    "id" TEXT NOT NULL,
    "consultation_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "weight_kg" DOUBLE PRECISION,
    "height_cm" DOUBLE PRECISION,
    "bmi" DOUBLE PRECISION,
    "temperature_c" DOUBLE PRECISION,
    "systolic_pressure" INTEGER,
    "diastolic_pressure" INTEGER,
    "heart_rate" INTEGER,
    "respiratory_rate" INTEGER,
    "oxygen_saturation" INTEGER,
    "glucose" DOUBLE PRECISION,
    "pain_scale" INTEGER,
    "observations" TEXT,
    "recorded_by_id" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vital_signs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnoses" (
    "id" TEXT NOT NULL,
    "consultation_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "doctor_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "DiagnosisType" NOT NULL DEFAULT 'PRESUMPTIVE',
    "code" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diagnoses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescriptions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "doctor_id" TEXT NOT NULL,
    "consultation_id" TEXT,
    "folio" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "diagnosis_text" TEXT,
    "instructions" TEXT,
    "recommendations" TEXT,
    "status" "PrescriptionStatus" NOT NULL DEFAULT 'DRAFT',
    "supersedes_id" TEXT,
    "pdf_asset_id" TEXT,
    "qr_validation_code" TEXT,
    "issued_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescription_items" (
    "id" TEXT NOT NULL,
    "prescription_id" TEXT NOT NULL,
    "medication_name" TEXT NOT NULL,
    "dose" TEXT,
    "frequency" TEXT,
    "route" TEXT,
    "duration" TEXT,
    "instructions" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "prescription_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_orders" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "doctor_id" TEXT NOT NULL,
    "consultation_id" TEXT,
    "folio" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "MedicalOrderType" NOT NULL,
    "reason" TEXT,
    "diagnosis_text" TEXT,
    "instructions" TEXT,
    "priority" "MedicalOrderPriority" NOT NULL DEFAULT 'ROUTINE',
    "status" "MedicalOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "pdf_asset_id" TEXT,
    "issued_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_order_items" (
    "id" TEXT NOT NULL,
    "medical_order_id" TEXT NOT NULL,
    "study_name" TEXT NOT NULL,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "medical_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_assets" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "checksum" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_documents" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "consultation_id" TEXT,
    "file_asset_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "DocumentCategory" NOT NULL,
    "document_date" TIMESTAMP(3),
    "description" TEXT,
    "privacy_level" "PrivacyLevel" NOT NULL DEFAULT 'GENERAL',
    "status" "DocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "uploaded_by_id" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_referrals" (
    "id" TEXT NOT NULL,
    "organization_from_id" TEXT NOT NULL,
    "organization_to_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "from_doctor_id" TEXT NOT NULL,
    "to_doctor_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "priority" "ReferralPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "ReferralStatus" NOT NULL DEFAULT 'DRAFT',
    "patient_authorized" BOOLEAN NOT NULL DEFAULT false,
    "patient_authorized_at" TIMESTAMP(3),
    "access_expires_at" TIMESTAMP(3),
    "referent_comments" TEXT,
    "sent_at" TIMESTAMP(3),
    "responded_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_shared_items" (
    "id" TEXT NOT NULL,
    "referral_id" TEXT NOT NULL,
    "field_key" TEXT NOT NULL,
    "field_label" TEXT NOT NULL,
    "value_text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_shared_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_responses" (
    "id" TEXT NOT NULL,
    "referral_id" TEXT NOT NULL,
    "attended_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "attended_at" TIMESTAMP(3),
    "general_assessment" TEXT,
    "general_diagnosis" TEXT,
    "recommendations" TEXT,
    "follow_up" TEXT,
    "requests_return" BOOLEAN NOT NULL DEFAULT false,
    "comments" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_access_logs" (
    "id" TEXT NOT NULL,
    "referral_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'EMAIL',
    "subject" TEXT,
    "body_html" TEXT,
    "body_text" TEXT,
    "whatsapp_template_name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'EMAIL',
    "type" "NotificationType" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "provider_id" TEXT,
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "related_entity" TEXT,
    "related_id" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_form_tokens" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "patient_id" TEXT,
    "appointment_id" TEXT,
    "type" "PublicFormTokenType" NOT NULL,
    "token" TEXT NOT NULL,
    "status" "PublicFormTokenStatus" NOT NULL DEFAULT 'GENERATED',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "opened_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "ip_address" TEXT,
    "user_agent" TEXT,
    "payload_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_form_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" "AuditAction" NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "old_values" JSONB,
    "new_values" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "branches_organization_id_idx" ON "branches"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_settings_organization_id_key" ON "organization_settings"("organization_id");

-- CreateIndex
CREATE INDEX "users_organization_id_idx" ON "users"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_organization_id_email_key" ON "users"("organization_id", "email");

-- CreateIndex
CREATE INDEX "roles_organization_id_idx" ON "roles"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE UNIQUE INDEX "doctor_profiles_user_id_key" ON "doctor_profiles"("user_id");

-- CreateIndex
CREATE INDEX "doctor_profiles_organization_id_idx" ON "doctor_profiles"("organization_id");

-- CreateIndex
CREATE INDEX "doctor_profiles_specialty_idx" ON "doctor_profiles"("specialty");

-- CreateIndex
CREATE INDEX "patients_organization_id_status_idx" ON "patients"("organization_id", "status");

-- CreateIndex
CREATE INDEX "patients_organization_id_first_name_last_name_1_idx" ON "patients"("organization_id", "first_name", "last_name_1");

-- CreateIndex
CREATE INDEX "patients_organization_id_phone_idx" ON "patients"("organization_id", "phone");

-- CreateIndex
CREATE INDEX "patients_organization_id_curp_idx" ON "patients"("organization_id", "curp");

-- CreateIndex
CREATE UNIQUE INDEX "patients_organization_id_record_number_key" ON "patients"("organization_id", "record_number");

-- CreateIndex
CREATE INDEX "patient_responsible_contacts_patient_id_idx" ON "patient_responsible_contacts"("patient_id");

-- CreateIndex
CREATE INDEX "patient_emergency_contacts_patient_id_idx" ON "patient_emergency_contacts"("patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "patient_sources_patient_id_key" ON "patient_sources"("patient_id");

-- CreateIndex
CREATE INDEX "patient_insurances_patient_id_idx" ON "patient_insurances"("patient_id");

-- CreateIndex
CREATE INDEX "patient_consents_patient_id_idx" ON "patient_consents"("patient_id");

-- CreateIndex
CREATE INDEX "patient_alerts_patient_id_is_active_idx" ON "patient_alerts"("patient_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "medical_profiles_patient_id_key" ON "medical_profiles"("patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "medical_histories_patient_id_key" ON "medical_histories"("patient_id");

-- CreateIndex
CREATE INDEX "allergies_patient_id_idx" ON "allergies"("patient_id");

-- CreateIndex
CREATE INDEX "chronic_conditions_patient_id_idx" ON "chronic_conditions"("patient_id");

-- CreateIndex
CREATE INDEX "current_medications_patient_id_idx" ON "current_medications"("patient_id");

-- CreateIndex
CREATE INDEX "vaccinations_patient_id_idx" ON "vaccinations"("patient_id");

-- CreateIndex
CREATE INDEX "appointments_organization_id_scheduled_date_idx" ON "appointments"("organization_id", "scheduled_date");

-- CreateIndex
CREATE INDEX "appointments_organization_id_doctor_id_scheduled_date_idx" ON "appointments"("organization_id", "doctor_id", "scheduled_date");

-- CreateIndex
CREATE INDEX "appointments_organization_id_status_idx" ON "appointments"("organization_id", "status");

-- CreateIndex
CREATE INDEX "appointment_status_history_appointment_id_idx" ON "appointment_status_history"("appointment_id");

-- CreateIndex
CREATE UNIQUE INDEX "visits_appointment_id_key" ON "visits"("appointment_id");

-- CreateIndex
CREATE INDEX "visits_organization_id_status_idx" ON "visits"("organization_id", "status");

-- CreateIndex
CREATE INDEX "visits_organization_id_arrival_time_idx" ON "visits"("organization_id", "arrival_time");

-- CreateIndex
CREATE INDEX "visits_organization_id_doctor_id_status_idx" ON "visits"("organization_id", "doctor_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "consultations_visit_id_key" ON "consultations"("visit_id");

-- CreateIndex
CREATE INDEX "consultations_organization_id_patient_id_idx" ON "consultations"("organization_id", "patient_id");

-- CreateIndex
CREATE INDEX "consultations_organization_id_doctor_id_date_idx" ON "consultations"("organization_id", "doctor_id", "date");

-- CreateIndex
CREATE INDEX "consultation_notes_consultation_id_idx" ON "consultation_notes"("consultation_id");

-- CreateIndex
CREATE INDEX "vital_signs_consultation_id_idx" ON "vital_signs"("consultation_id");

-- CreateIndex
CREATE INDEX "vital_signs_patient_id_idx" ON "vital_signs"("patient_id");

-- CreateIndex
CREATE INDEX "diagnoses_consultation_id_idx" ON "diagnoses"("consultation_id");

-- CreateIndex
CREATE INDEX "diagnoses_patient_id_idx" ON "diagnoses"("patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "prescriptions_supersedes_id_key" ON "prescriptions"("supersedes_id");

-- CreateIndex
CREATE INDEX "prescriptions_organization_id_patient_id_idx" ON "prescriptions"("organization_id", "patient_id");

-- CreateIndex
CREATE INDEX "prescriptions_organization_id_status_idx" ON "prescriptions"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "prescriptions_organization_id_folio_key" ON "prescriptions"("organization_id", "folio");

-- CreateIndex
CREATE INDEX "prescription_items_prescription_id_idx" ON "prescription_items"("prescription_id");

-- CreateIndex
CREATE INDEX "medical_orders_organization_id_patient_id_idx" ON "medical_orders"("organization_id", "patient_id");

-- CreateIndex
CREATE INDEX "medical_orders_organization_id_status_idx" ON "medical_orders"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "medical_orders_organization_id_folio_key" ON "medical_orders"("organization_id", "folio");

-- CreateIndex
CREATE INDEX "medical_order_items_medical_order_id_idx" ON "medical_order_items"("medical_order_id");

-- CreateIndex
CREATE INDEX "file_assets_organization_id_idx" ON "file_assets"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "patient_documents_file_asset_id_key" ON "patient_documents"("file_asset_id");

-- CreateIndex
CREATE INDEX "patient_documents_organization_id_patient_id_idx" ON "patient_documents"("organization_id", "patient_id");

-- CreateIndex
CREATE INDEX "patient_documents_organization_id_category_idx" ON "patient_documents"("organization_id", "category");

-- CreateIndex
CREATE INDEX "medical_referrals_organization_from_id_idx" ON "medical_referrals"("organization_from_id");

-- CreateIndex
CREATE INDEX "medical_referrals_organization_to_id_idx" ON "medical_referrals"("organization_to_id");

-- CreateIndex
CREATE INDEX "medical_referrals_status_idx" ON "medical_referrals"("status");

-- CreateIndex
CREATE INDEX "referral_shared_items_referral_id_idx" ON "referral_shared_items"("referral_id");

-- CreateIndex
CREATE UNIQUE INDEX "referral_responses_referral_id_key" ON "referral_responses"("referral_id");

-- CreateIndex
CREATE INDEX "referral_access_logs_referral_id_idx" ON "referral_access_logs"("referral_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_organization_id_type_channel_key" ON "notification_templates"("organization_id", "type", "channel");

-- CreateIndex
CREATE INDEX "notification_logs_organization_id_status_idx" ON "notification_logs"("organization_id", "status");

-- CreateIndex
CREATE INDEX "notification_logs_organization_id_type_idx" ON "notification_logs"("organization_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "public_form_tokens_token_key" ON "public_form_tokens"("token");

-- CreateIndex
CREATE INDEX "public_form_tokens_organization_id_status_idx" ON "public_form_tokens"("organization_id", "status");

-- CreateIndex
CREATE INDEX "public_form_tokens_token_idx" ON "public_form_tokens"("token");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_entity_entity_id_idx" ON "audit_logs"("organization_id", "entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_profiles" ADD CONSTRAINT "doctor_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_profiles" ADD CONSTRAINT "doctor_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_possible_duplicate_of_id_fkey" FOREIGN KEY ("possible_duplicate_of_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_responsible_contacts" ADD CONSTRAINT "patient_responsible_contacts_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_emergency_contacts" ADD CONSTRAINT "patient_emergency_contacts_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_sources" ADD CONSTRAINT "patient_sources_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_insurances" ADD CONSTRAINT "patient_insurances_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_consents" ADD CONSTRAINT "patient_consents_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_alerts" ADD CONSTRAINT "patient_alerts_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_profiles" ADD CONSTRAINT "medical_profiles_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_histories" ADD CONSTRAINT "medical_histories_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allergies" ADD CONSTRAINT "allergies_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chronic_conditions" ADD CONSTRAINT "chronic_conditions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "current_medications" ADD CONSTRAINT "current_medications_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccinations" ADD CONSTRAINT "vaccinations_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_status_history" ADD CONSTRAINT "appointment_status_history_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation_notes" ADD CONSTRAINT "consultation_notes_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vital_signs" ADD CONSTRAINT "vital_signs_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "prescriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_orders" ADD CONSTRAINT "medical_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_orders" ADD CONSTRAINT "medical_orders_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_orders" ADD CONSTRAINT "medical_orders_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_orders" ADD CONSTRAINT "medical_orders_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_order_items" ADD CONSTRAINT "medical_order_items_medical_order_id_fkey" FOREIGN KEY ("medical_order_id") REFERENCES "medical_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_documents" ADD CONSTRAINT "patient_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_documents" ADD CONSTRAINT "patient_documents_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_documents" ADD CONSTRAINT "patient_documents_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_documents" ADD CONSTRAINT "patient_documents_file_asset_id_fkey" FOREIGN KEY ("file_asset_id") REFERENCES "file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_documents" ADD CONSTRAINT "patient_documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_referrals" ADD CONSTRAINT "medical_referrals_organization_from_id_fkey" FOREIGN KEY ("organization_from_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_referrals" ADD CONSTRAINT "medical_referrals_organization_to_id_fkey" FOREIGN KEY ("organization_to_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_referrals" ADD CONSTRAINT "medical_referrals_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_referrals" ADD CONSTRAINT "medical_referrals_from_doctor_id_fkey" FOREIGN KEY ("from_doctor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_referrals" ADD CONSTRAINT "medical_referrals_to_doctor_id_fkey" FOREIGN KEY ("to_doctor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_shared_items" ADD CONSTRAINT "referral_shared_items_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "medical_referrals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_responses" ADD CONSTRAINT "referral_responses_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "medical_referrals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_access_logs" ADD CONSTRAINT "referral_access_logs_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "medical_referrals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_form_tokens" ADD CONSTRAINT "public_form_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_form_tokens" ADD CONSTRAINT "public_form_tokens_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_form_tokens" ADD CONSTRAINT "public_form_tokens_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
