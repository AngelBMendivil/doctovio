import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  console.log("Sembrando datos de ejemplo...");

  const org = await db.organization.create({
    data: {
      name: "Consultorio Demo",
      legalName: "Consultorio Demo S.C.",
      settings: {
        create: {
          timezone: "America/Mexico_City",
          currency: "MXN",
          language: "es",
          defaultAppointmentMin: 30,
          toleranceMinutes: 10,
          whatsappEnabled: false,
          privacyNoticeHtml: "<p>Aviso de privacidad de ejemplo. Sustituir por el texto legal real.</p>",
        },
      },
    },
  });

  const branch = await db.branch.create({
    data: { organizationId: org.id, name: "Sucursal Principal", isMain: true, city: "Ciudad de México", country: "MX" },
  });

  const passwordHash = await bcrypt.hash("Demo1234!", 10);

  const admin = await db.user.create({
    data: {
      organizationId: org.id,
      email: "admin@demo.com",
      passwordHash,
      fullName: "Ana Administradora",
      primaryRole: "ADMIN",
    },
  });

  const doctor = await db.user.create({
    data: {
      organizationId: org.id,
      email: "doctor@demo.com",
      passwordHash,
      fullName: "Dr. Carlos Ramírez",
      primaryRole: "DOCTOR",
      doctorProfile: {
        create: {
          organizationId: org.id,
          specialty: "Medicina General",
          licenseNumber: "1234567",
          city: "Ciudad de México",
          state: "CDMX",
          acceptsReferrals: true,
          listedInDirectory: true,
        },
      },
    },
  });

  await db.user.create({
    data: {
      organizationId: org.id,
      email: "asistente@demo.com",
      passwordHash,
      fullName: "Laura Asistente",
      primaryRole: "ASSISTANT",
    },
  });

  const patient = await db.patient.create({
    data: {
      organizationId: org.id,
      recordNumber: "EXP-2026-00001",
      firstName: "María",
      lastLastName: "González",
      secondLastName: "López",
      birthDate: new Date("1990-05-12"),
      sex: "FEMALE",
      phone: "5555555555",
      email: "paciente.demo@example.com",
      city: "Ciudad de México",
      state: "CDMX",
      country: "MX",
      medicalProfile: { create: { bloodType: "O+" } },
      medicalHistory: { create: {} },
      allergies: { create: [{ substance: "Penicilina", reaction: "Urticaria", severity: "HIGH" }] },
    },
  });

  const appointment = await db.appointment.create({
    data: {
      organizationId: org.id,
      branchId: branch.id,
      patientId: patient.id,
      doctorId: doctor.id,
      scheduledDate: new Date(),
      startTime: new Date(),
      durationMinutes: 30,
      type: "FIRST_TIME",
      reason: "Consulta general de ejemplo",
      status: "CONFIRMED",
      createdById: admin.id,
    },
  });

  console.log("Seed completado:");
  console.log({ organization: org.name, admin: admin.email, doctor: doctor.email, patient: patient.recordNumber, appointment: appointment.id });
  console.log("Contraseña para todos los usuarios de ejemplo: Demo1234!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
