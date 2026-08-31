import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getOrganizationWithBranches, getMainBranch } from "@/lib/services/organizations";
import { listUsers } from "@/lib/services/users";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { SettingsTabs } from "./settings-tabs";
import { SettingsForm } from "./settings-form";
import { CountryStateSelect } from "./country-state-select";
import { LogoUploader } from "./logo-uploader";
import { ScheduleEditor } from "./schedule-editor";
import { GoogleCalendarSection } from "./google-calendar-section";
import { isGoogleConfigured } from "@/lib/google/config";
import { PrescriptionTemplateEditor } from "./prescription-template-editor";
import { resolveTemplate } from "@/lib/services/letterhead";
import {
  updateSettingsAction,
  updateOrganizationProfileAction,
  upsertBranchAction,
  createUserAction,
  updateUserAction,
  upsertDoctorProfileAction,
  updateSocialMediaAction,
} from "@/lib/actions/settings";

const ROLE_LABEL: Record<string, string> = { ADMIN: "Administrador", DOCTOR: "Médico", ASSISTANT: "Asistente" };

// Zonas horarias de México (IANA) + etiquetas legibles.
const TIMEZONES: { value: string; label: string }[] = [
  { value: "America/Tijuana", label: "Tijuana / Baja California (Pacífico)" },
  { value: "America/Hermosillo", label: "Hermosillo / Sonora (sin horario de verano)" },
  { value: "America/Mazatlan", label: "Mazatlán / Sinaloa, Nayarit, BCS" },
  { value: "America/Chihuahua", label: "Chihuahua" },
  { value: "America/Ojinaga", label: "Ojinaga" },
  { value: "America/Bahia_Banderas", label: "Bahía de Banderas" },
  { value: "America/Monterrey", label: "Monterrey / Noreste" },
  { value: "America/Matamoros", label: "Matamoros" },
  { value: "America/Mexico_City", label: "Ciudad de México / Centro" },
  { value: "America/Merida", label: "Mérida / Yucatán" },
  { value: "America/Cancun", label: "Cancún / Quintana Roo" },
];

const CURRENCIES = ["MXN", "USD"];
const GRID = "grid grid-cols-1 gap-4 md:grid-cols-2";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) return null;
  if (session.role !== "ADMIN") {
    return <p className="text-sm text-muted-foreground">Solo el administrador puede ver esta sección.</p>;
  }

  const [org, users, mainBranch, schedules, googleConns] = await Promise.all([
    getOrganizationWithBranches(session.organizationId),
    listUsers(session.organizationId),
    getMainBranch(session.organizationId),
    db.doctorSchedule.findMany({
      where: { organizationId: session.organizationId, isActive: true },
      orderBy: { weekday: "asc" },
    }),
    db.googleCalendarConnection.findMany({ where: { organizationId: session.organizationId } }),
  ]);

  const doctors = users.filter((u) => u.primaryRole === "DOCTOR");
  // Se lee en el servidor: `process.env` no existe en los componentes de cliente.
  const googleReady = isGoogleConfigured();
  const currentTz = org?.settings?.timezone ?? "America/Mexico_City";

  // --- Plantilla de receta y redes sociales (guardadas en settings.prescriptionTemplate) ---
  const tmpl = (org?.settings?.prescriptionTemplate as Record<string, unknown> | null) ?? {};
  const templateConfig = resolveTemplate(org?.settings?.prescriptionTemplate);
  const social = (tmpl.social as { website?: string; facebook?: string; instagram?: string } | null) ?? {};
  const doc0 = doctors[0];
  const previewData = {
    logoUrl: org?.logoUrl ?? null,
    clinic: {
      name: org?.name ?? "",
      address: [mainBranch?.address, mainBranch?.city, mainBranch?.state].filter(Boolean).join(", "),
      phone: mainBranch?.phone ?? "",
      email: doc0?.doctorProfile?.professionalEmail ?? "",
    },
    doctor: {
      name: doc0?.fullName ?? "",
      specialty: doc0?.doctorProfile?.specialty ?? "",
      license: doc0?.doctorProfile?.licenseNumber ?? "",
      specialtyLicense: doc0?.doctorProfile?.specialtyLicense ?? "",
      ssaNumber: doc0?.doctorProfile?.ssaNumber ?? "",
      stateRegistration: doc0?.doctorProfile?.stateRegistration ?? "",
    },
    social: { website: social.website ?? "", facebook: social.facebook ?? "", instagram: social.instagram ?? "" },
  };

  // --- Contenido de cada pestaña ---

  const consultorioTab = (
    <Card>
      <CardContent className="space-y-6 pt-6">
        <SettingsForm action={updateOrganizationProfileAction} submitLabel="Guardar datos" className={GRID}>
          <div>
            <Label>Nombre del consultorio *</Label>
            <Input name="name" required defaultValue={org?.name ?? ""} />
          </div>
          <div>
            <Label>Razón social</Label>
            <Input name="legalName" defaultValue={org?.legalName ?? ""} />
          </div>
        </SettingsForm>

        <div className="border-t border-border pt-6">
          <p className="mb-1 text-sm font-medium">Logotipo</p>
          <p className="mb-3 text-xs text-muted-foreground">
            Aparece en el encabezado de la receta cuando la plantilla tiene activada la opción “Logotipo”.
          </p>
          <LogoUploader current={org?.logoUrl ?? null} />
        </div>
      </CardContent>
    </Card>
  );

  const direccionTab = (
    <Card>
      <CardContent className="pt-6">
        <SettingsForm action={upsertBranchAction} submitLabel="Guardar dirección" className={GRID}>
          <div className="md:col-span-2">
            <Label>Nombre de la sucursal *</Label>
            <Input name="name" required defaultValue={mainBranch?.name ?? "Sucursal Principal"} />
          </div>
          <div className="md:col-span-2">
            <Label>Calle y número</Label>
            <Input name="address" defaultValue={mainBranch?.address ?? ""} />
          </div>
          <CountryStateSelect defaultCountry={mainBranch?.country} defaultState={mainBranch?.state} />
          <div>
            <Label>Ciudad</Label>
            <Input name="city" defaultValue={mainBranch?.city ?? ""} />
          </div>
          <div>
            <Label>Código postal</Label>
            <Input name="postalCode" defaultValue={mainBranch?.postalCode ?? ""} />
          </div>
          <div>
            <Label>Teléfono</Label>
            <Input name="phone" defaultValue={mainBranch?.phone ?? ""} />
          </div>
        </SettingsForm>
      </CardContent>
    </Card>
  );

  const generalTab = (
    <Card>
      <CardContent className="pt-6">
        <SettingsForm action={updateSettingsAction} submitLabel="Guardar configuración" className={GRID}>
          <div>
            <Label>Zona horaria</Label>
            <Select name="timezone" defaultValue={currentTz}>
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Moneda</Label>
            <Select name="currency" defaultValue={org?.settings?.currency ?? "MXN"}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Idioma</Label>
            <Input name="language" defaultValue={org?.settings?.language ?? "es"} />
          </div>
          <div>
            <Label>Duración de consulta (min)</Label>
            <Input name="defaultAppointmentMin" type="number" defaultValue={org?.settings?.defaultAppointmentMin ?? 30} />
          </div>
          <div>
            <Label>Tolerancia (min)</Label>
            <Input name="toleranceMinutes" type="number" defaultValue={org?.settings?.toleranceMinutes ?? 10} />
          </div>
          <div>
            <Label>Precio base consulta (MXN)</Label>
            <Input name="basePriceMxn" type="number" step="0.01" defaultValue={org?.settings?.basePriceMxn ?? ""} />
          </div>
          <div>
            <Label>Precio base consulta (USD)</Label>
            <Input name="basePriceUsd" type="number" step="0.01" defaultValue={org?.settings?.basePriceUsd ?? ""} />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input type="checkbox" name="whatsappEnabled" id="whatsappEnabled" defaultChecked={org?.settings?.whatsappEnabled} />
            <Label htmlFor="whatsappEnabled" className="mb-0">Habilitar WhatsApp para esta organización</Label>
          </div>
          <div className="md:col-span-2">
            <Label>Aviso de privacidad (HTML)</Label>
            <Textarea name="privacyNoticeHtml" defaultValue={org?.settings?.privacyNoticeHtml ?? ""} rows={6} />
          </div>
        </SettingsForm>
      </CardContent>
    </Card>
  );

  const usuariosTab = (
    <Card>
      <CardContent className="space-y-4 pt-6 text-sm">
        <div className="space-y-2">
          {users.map((u) => (
            <details key={u.id} className="rounded-md border border-border">
              <summary className="flex cursor-pointer select-none items-center justify-between px-3 py-2.5">
                <span>{u.fullName} · <span className="text-muted-foreground">{u.email}</span></span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{ROLE_LABEL[u.primaryRole] ?? u.primaryRole}</span>
                  <span className="text-xs font-medium text-primary">Editar</span>
                </span>
              </summary>
              <div className="border-t border-border p-4">
                <SettingsForm action={updateUserAction} submitLabel="Guardar cambios" className={GRID}>
                  <input type="hidden" name="userId" value={u.id} />
                  <div>
                    <Label>Nombre completo *</Label>
                    <Input name="fullName" required defaultValue={u.fullName} />
                  </div>
                  <div>
                    <Label>Correo</Label>
                    <Input defaultValue={u.email} disabled />
                    <p className="mt-1 text-xs text-muted-foreground">El correo no se puede modificar.</p>
                  </div>
                  <div>
                    <Label>Teléfono</Label>
                    <Input name="phone" defaultValue={u.phone ?? ""} />
                  </div>
                  <div>
                    <Label>Rol *</Label>
                    <Select name="role" defaultValue={u.primaryRole} required>
                      <option value="ASSISTANT">Asistente</option>
                      <option value="DOCTOR">Médico</option>
                      <option value="ADMIN">Administrador</option>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <Label>Restablecer contraseña (opcional)</Label>
                    <Input name="password" type="text" minLength={8} placeholder="Dejar en blanco para conservar la actual" />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Escribe una nueva contraseña (mínimo 8 caracteres) solo si deseas cambiarla.
                    </p>
                  </div>
                </SettingsForm>
              </div>
            </details>
          ))}
        </div>

        <div className="rounded-md border border-border p-4">
          <p className="mb-3 font-medium">Agregar usuario</p>
          <SettingsForm action={createUserAction} submitLabel="Crear usuario" className={GRID} resetOnSuccess>
            <div>
              <Label>Nombre completo *</Label>
              <Input name="fullName" required />
            </div>
            <div>
              <Label>Correo *</Label>
              <Input name="email" type="email" required />
            </div>
            <div>
              <Label>Teléfono</Label>
              <Input name="phone" />
            </div>
            <div>
              <Label>Rol *</Label>
              <Select name="role" defaultValue="ASSISTANT" required>
                <option value="ASSISTANT">Asistente</option>
                <option value="DOCTOR">Médico</option>
                <option value="ADMIN">Administrador</option>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Contraseña inicial * (mínimo 8 caracteres)</Label>
              <Input name="password" type="text" minLength={8} required />
              <p className="mt-1 text-xs text-muted-foreground">
                El usuario podrá iniciar sesión con este correo y contraseña.
              </p>
            </div>
          </SettingsForm>
        </div>
      </CardContent>
    </Card>
  );

  const medicoTab = (
    <Card>
      <CardContent className="space-y-6 pt-6 text-sm">
        {doctors.length === 0 && (
          <p className="text-muted-foreground">
            No hay médicos registrados. Crea un usuario con rol Médico en la pestaña Usuarios para configurar su perfil.
          </p>
        )}
        {doctors.map((doc) => {
          const p = doc.doctorProfile;
          return (
            <div key={doc.id} className="space-y-4">
            <SettingsForm
              action={upsertDoctorProfileAction}
              submitLabel="Guardar perfil"
              className={`${GRID} rounded-md border border-border p-4`}
            >
              <input type="hidden" name="userId" value={doc.id} />
              <p className="md:col-span-2 font-medium">{doc.fullName} · {doc.email}</p>
              <div>
                <Label>Especialidad</Label>
                <Input name="specialty" defaultValue={p?.specialty ?? ""} />
              </div>
              <div>
                <Label>Subespecialidad</Label>
                <Input name="subspecialty" defaultValue={p?.subspecialty ?? ""} />
              </div>
              <div>
                <Label>Cédula profesional</Label>
                <Input name="licenseNumber" defaultValue={p?.licenseNumber ?? ""} />
              </div>
              <div>
                <Label>Cédula de especialidad</Label>
                <Input name="specialtyLicense" defaultValue={p?.specialtyLicense ?? ""} />
              </div>
              <div className="md:col-span-2">
                <Label>Cédulas para la receta (una por línea)</Label>
                <Textarea name="licensesText" rows={3} defaultValue={p?.licensesText ?? ""} placeholder={"UABC Cédula profesional 8431918\nUDG Cédula especialidad 11754947\nUNAM Cédula especialidad 11984208"} />
                <p className="mt-1 text-xs text-muted-foreground">
                  Si lo llenas, estas líneas reemplazan las cédulas del encabezado de la receta (permite institución y varias cédulas).
                </p>
              </div>
              <div>
                <Label>S.S.A.</Label>
                <Input name="ssaNumber" defaultValue={p?.ssaNumber ?? ""} placeholder="Registro Secretaría de Salud" />
              </div>
              <div>
                <Label>Reg. Edo.</Label>
                <Input name="stateRegistration" defaultValue={p?.stateRegistration ?? ""} placeholder="Registro estatal" />
              </div>
              <div>
                <Label>RFC</Label>
                <Input name="rfc" defaultValue={p?.rfc ?? ""} maxLength={13} placeholder="XAXX010101000" className="uppercase" />
              </div>
              <div>
                <Label>Teléfono profesional</Label>
                <Input name="professionalPhone" defaultValue={p?.professionalPhone ?? ""} />
              </div>
              <div>
                <Label>Correo profesional</Label>
                <Input name="professionalEmail" type="email" defaultValue={p?.professionalEmail ?? ""} />
              </div>
              <CountryStateSelect defaultState={p?.state} />
              <div>
                <Label>Ciudad</Label>
                <Input name="city" defaultValue={p?.city ?? ""} />
              </div>
            </SettingsForm>

            <div className="rounded-md border border-border p-4">
              <p className="mb-1 font-medium">Horario de atención</p>
              <p className="mb-3 text-xs text-muted-foreground">
                Base de la disponibilidad: sin horario, el asistente no puede ofrecer citas.
              </p>
              <ScheduleEditor
                doctorId={doc.id}
                rows={schedules
                  .filter((s) => s.doctorId === doc.id)
                  .map((s) => ({ weekday: s.weekday, startMinute: s.startMinute, endMinute: s.endMinute }))}
              />
            </div>

            <GoogleCalendarSection
              doctorId={doc.id}
              doctorName={doc.fullName}
              configured={googleReady}
              connection={(() => {
                const c = googleConns.find((g) => g.doctorId === doc.id);
                return c
                  ? {
                      googleEmail: c.googleEmail,
                      pullBusy: c.pullBusy,
                      pushEvents: c.pushEvents,
                      lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
                      lastError: c.lastError,
                    }
                  : null;
              })()}
            />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );

  const recetaTab = (
    <Card>
      <CardContent className="pt-6">
        <p className="mb-4 text-sm text-muted-foreground">
          Define el papel membretado del consultorio. El encabezado y pie toman los datos del consultorio y del perfil
          del médico, y aplican por igual a la receta y a la solicitud de referencia.
        </p>
        <PrescriptionTemplateEditor initial={templateConfig} preview={previewData} />
      </CardContent>
    </Card>
  );

  const socialTab = (
    <Card>
      <CardContent className="pt-6">
        <SettingsForm action={updateSocialMediaAction} submitLabel="Guardar redes" className={GRID}>
          <div className="md:col-span-2">
            <Label>Página web</Label>
            <Input name="website" defaultValue={previewData.social.website} placeholder="https://tuconsultorio.com" />
          </div>
          <div>
            <Label>Facebook</Label>
            <Input name="facebook" defaultValue={previewData.social.facebook} placeholder="facebook.com/tuconsultorio" />
          </div>
          <div>
            <Label>Instagram</Label>
            <Input name="instagram" defaultValue={previewData.social.instagram} placeholder="@tuconsultorio" />
          </div>
        </SettingsForm>
      </CardContent>
    </Card>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-xl font-semibold">Configuración del consultorio</h1>

      <SettingsTabs
        tabs={[
          { id: "consultorio", label: "Datos del consultorio", content: consultorioTab },
          { id: "direccion", label: "Dirección sucursal", content: direccionTab },
          { id: "general", label: "General", content: generalTab },
          { id: "usuarios", label: "Usuarios", content: usuariosTab },
          { id: "medico", label: "Perfil médico", content: medicoTab },
          { id: "receta", label: "Receta", content: recetaTab },
          { id: "social", label: "Social media", content: socialTab },
        ]}
      />
    </div>
  );
}
