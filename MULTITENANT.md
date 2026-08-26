# Doctovio — Análisis de ajuste multi-consultorio

Objetivo: soportar ~40 consultorios aislados, escalables sin rehacer arquitectura.
Fecha de análisis: 25 ago 2026.

---

## 1. Diagnóstico de la arquitectura actual

**Doctovio YA es multi-tenant.** El prompt original asumía una app de un solo
consultorio. No lo es. Lo que existe hoy:

| Capa | Estado |
|---|---|
| Columna de tenant | `organizationId` en **25 modelos** (95 ocurrencias en el schema) |
| Servicios | Los 23 archivos de `lib/services/` reciben `organizationId` como 1er parámetro |
| Sesión | El JWT ya carga `organizationId` (`lib/auth/session.ts`) |
| Storage | `buildStorageKey(organizationId, fileName)` — el bucket ya particiona |
| Unicidad | `@@unique([organizationId, email])` — dos clínicas pueden repetir correo |
| Jerarquía | Ya existe `Organization → Branch` (sucursales) |
| RBAC | Matriz declarativa en `lib/auth/rbac.ts` |
| Auditoría | `AuditLog` con `organizationId` |

**El patrón de aislamiento en uso** es leer-antes-de-escribir:

```ts
const current = await db.appointment.findFirstOrThrow({
  where: { id: appointmentId, organizationId },   // ← el guard
});
await tx.appointment.update({ where: { id: appointmentId }, ... }); // ya validado
```

Es correcto y está aplicado con disciplina. **Pero es convención, no estructura:**
nada impide que el próximo `db.patient.findMany()` olvide el `organizationId`.
Un solo olvido = fuga entre consultorios, sin error visible.

### Veredicto

No hace falta una migración multi-tenant. Hace falta:

1. **Cerrar 3 agujeros reales** que sí existen.
2. **Convertir la convención en estructura** (que el olvido falle, no filtre).
3. **Agregar la capa comercial** (tipo, estado, límite de usuarios, super admin).

---

## 2. Decisión arquitectónica principal (requiere visto bueno)

### `Clinic` NO debe ser una entidad nueva. `Organization` YA es el consultorio.

| Opción | Qué implica | Veredicto |
|---|---|---|
| **A. Agregar `clinic_id` junto a `organization_id`** | Dos tenants en paralelo, dos joins, ambigüedad permanente | **Rechazar.** Es la peor opción |
| **B. Renombrar todo a `clinic_id`** | Migración de 25 tablas + 95 referencias + 153 archivos. Riesgo alto, ganancia funcional **cero** | **Rechazar** para esta fase |
| **C. `Organization` ES `Clinic`; se le agregan los campos que faltan** | Cambio aditivo, sin downtime, sin tocar los 23 servicios | **Recomendado** |

Con la opción C tu modelo objetivo se cumple íntegro — solo que la tabla se
llama `organizations` en vez de `clinics`. El vocabulario "Consultorio" se usa
en la **UI y el dominio**; `organizationId` queda como nombre técnico interno.

> Si aun así quieres el renombre físico a `clinic_id`, es viable, pero debe ser
> una fase propia y aislada, nunca mezclada con cambios funcionales.

---

## 3. Modelo de datos propuesto (aditivo)

### 3.1 Extender `Organization`

```prisma
enum ClinicType   { MEDICAL  DENTAL }          // extensible sin tocar el core
enum ClinicStatus { TRIAL  ACTIVE  SUSPENDED  CANCELLED }

model Organization {
  // ... campos actuales sin tocar ...
  type      ClinicType   @default(MEDICAL)
  status    ClinicStatus @default(TRIAL)
  maxUsers  Int          @default(3)  @map("max_users")
  // isActive se conserva y se deriva de status (compatibilidad)
}
```

`isActive` **no se elimina**: se mantiene sincronizado con `status` para no
romper el código existente que lo consulta. Se deprecia después.

### 3.2 Nueva tabla `ClinicUser` (el cambio estructural real)

Hoy `User.organizationId` es una columna directa → **un usuario pertenece a
exactamente una clínica**. El requisito de "un doctor en varios consultorios"
no cabe en ese modelo.

```prisma
model ClinicUser {
  id             String        @id @default(cuid())
  organizationId String        @map("organization_id")
  userId         String        @map("user_id")
  role           UserRoleName
  status         UserStatus    @default(ACTIVE)
  isPrimary      Boolean       @default(false) @map("is_primary")

  organization Organization @relation(fields: [organizationId], references: [id])
  user         User         @relation(fields: [userId], references: [id])

  @@unique([organizationId, userId])
  @@index([userId])
  @@map("clinic_users")
}
```

**Estrategia de convivencia:** `User.organizationId` se conserva como
"clínica primaria" (compatibilidad total con el código actual). `ClinicUser` se
puebla por migración desde ese campo. El día que se active multi-clínica, la
sesión pasa a leer de `ClinicUser` y `User.organizationId` se vuelve el default.

### 3.3 `SUPER_ADMIN` fuera del enum de roles de clínica

```prisma
model User {
  isPlatformAdmin Boolean @default(false) @map("is_platform_admin")
}
```

**Por qué no meterlo en `UserRoleName`:** ese enum alimenta `PERMISSIONS` en
`rbac.ts`, donde cada permiso lista roles. Agregar `SUPER_ADMIN` ahí obligaría a
tocar las 26 entradas de la matriz y, peor, crearía un rol que "existe dentro de
una clínica" — justo lo contrario de lo que es. Como flag booleano, la excepción
es **explícita, auditable y de un solo punto de control**.

### 3.4 Enrutamiento de WhatsApp por instancia

```prisma
model WhatsappConnection {
  id             String   @id @default(cuid())
  organizationId String   @map("organization_id")
  provider       String   @default("META")     // META | GREEN_API
  instanceId     String   @map("instance_id")  // phone_number_id o instance de Green
  phoneNumber    String   @map("phone_number")
  accessToken    String?  @map("access_token")
  status         String   @default("ACTIVE")

  @@unique([provider, instanceId])   // ← la llave del enrutamiento
  @@index([organizationId])
  @@map("whatsapp_connections")
}
```

`@@unique([provider, instanceId])` es lo que hace **imposible** que un webhook
resuelva a dos clínicas.

---

## 4. Cambios requeridos por tabla

### Grupo A — Ya correctas, no se tocan (25)

`Payment, Branch, OrganizationSettings, User, Role, DoctorProfile, Patient,
Insurer, Appointment, ReminderJob, GoogleCalendarConnection, ConversationSession,
DoctorSchedule, ScheduleBlock, AppointmentHold, Visit, Consultation,
Prescription, MedicalOrder, FileAsset, PatientDocument, NotificationTemplate,
NotificationLog, PublicFormToken, AuditLog`

### Grupo B — Hijas: heredan tenant por su padre (18)

`PatientResponsibleContact, PatientEmergencyContact, PatientInsurance,
PatientConsent, PatientAlert, MedicalProfile, MedicalHistory, Allergy,
ChronicCondition, CurrentMedication, Vaccination, ConversationMessage,
AppointmentStatusHistory, ConsultationNote, VitalSign, Diagnosis,
PrescriptionItem, MedicalOrderItem`

**Decisión: NO se les agrega `organization_id` en fase 1.** Solo se alcanzan
navegando desde un padre ya filtrado. Agregar la columna significa mantener
consistencia en cada escritura (riesgo de desincronización) a cambio de un
beneficio nulo mientras no haya RLS.

> **Excepción para fase 2:** si se activa RLS, estas tablas **sí** necesitan la
> columna, porque una política RLS no puede razonar sobre el padre sin un join
> costoso. Esa es la principal factura oculta de RLS.

### Grupo C — Requieren atención explícita

| Tabla | Situación | Acción |
|---|---|---|
| `MedicalReferral` | Cross-org **por diseño** (`ReferralOrgFrom`/`ReferralOrgTo`) | Ninguna. Es la excepción legítima. Documentar |
| `ReferralSharedItem`, `ReferralResponse`, `ReferralAccessLog` | Hijas de la referencia cross-org | Ninguna |
| `Permission`, `RolePermission` | Catálogo global de plataforma | Correcto sin tenant |
| `UserRole` | Hija de `User` | Correcto |
| `Organization` | Es el tenant | Agregar `type`, `status`, `maxUsers` |

### Índices a agregar

```prisma
@@index([organizationId, status])                  // Patient, Appointment
@@index([organizationId, startTime])               // Appointment ← el más caliente
@@index([organizationId, doctorId, startTime])     // Appointment
@@index([organizationId, phone])                   // Patient ← resolución WhatsApp
@@unique([provider, instanceId])                   // WhatsappConnection
```

**Ojo:** el índice de agenda va sobre `startTime`, **nunca** sobre
`scheduledDate` (ver la regla dura en `CLAUDE.md`: `scheduledDate` es medianoche
UTC y desplaza el día en zonas de México).

---

## 5. Cambios en autenticación y autorización

### Estado actual

`SessionPayload = { userId, organizationId, role, fullName, email }`

El middleware solo verifica **que la firma del JWT sea válida**. No comprueba
que la clínica siga activa ni que el usuario siga vigente.

### Agujero: la suspensión no se aplica

Hoy, si suspendes una clínica, **sus usuarios siguen operando con normalidad**
hasta que expire la cookie: **7 días**. El JWT es autocontenido y nadie
revalida contra la base. Suspender no suspende nada.

### Cambios

```ts
export type SessionPayload = {
  userId: string;
  organizationId: string;        // clínica activa
  role: UserRoleName;
  isPlatformAdmin: boolean;      // ← nuevo
  fullName: string;
  email: string;
};
```

1. **`requireSession()` valida estado** contra la base: clínica en
   `ACTIVE | TRIAL` y usuario en `ACTIVE`. Si no, destruye la sesión.
   Costo: 1 query indexada por request; cacheable a 30–60 s si pesa.
2. **`requireClinicAccess(orgId)`**: para `isPlatformAdmin` pasa siempre;
   para el resto exige coincidencia con la sesión.
3. **`assertUserQuota(orgId)`**: valida `maxUsers` al dar de alta.
4. **`requireActiveClinic()`**: bloquea escrituras en clínicas suspendidas
   pero **permite lectura** — así la clínica ve su información sin poder operar.

---

## 6. Estrategia de aislamiento multi-tenant

Tres capas, de más barata a más cara:

### Capa 1 — Tipos que obligan (fase 1, alto valor / bajo costo)

Un tipo de marca hace que "olvidar el tenant" sea un **error de compilación**:

```ts
export type ClinicScope = {
  readonly organizationId: string;
  readonly __brand: unique symbol;
};
export async function clinicScope(): Promise<ClinicScope> { /* desde la sesión */ }
```

Los servicios pasan a recibir `ClinicScope` en vez de `string`. Un
`organizationId` fabricado a mano deja de ser aceptable para el compilador. Sin
costo en runtime.

### Capa 2 — Cliente Prisma con guardia (fase 1)

Extensión de Prisma que inyecta `organizationId` en toda operación sobre tablas
con tenant y **falla cerrado** si no hay scope:

```ts
export function scopedDb(scope: ClinicScope) {
  return db.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);
          if (!scope) throw new Error(`TENANT_SCOPE_MISSING: ${model}.${operation}`);
          args.where = { ...args.where, organizationId: scope.organizationId };
          return query(args);
        },
      },
    },
  });
}
```

Atrapa el olvido en runtime aunque los tipos se hayan esquivado.

### Capa 3 — PostgreSQL RLS (fase 2, ver §7)

---

## 7. Viabilidad de PostgreSQL RLS

**Veredicto: viable y recomendable, pero como fase 2 — no como primer paso.**

### A favor

- Defensa real en la base: ni un bug de la app ni un `$queryRaw` la esquivan.
- Es el estándar para datos clínicos.
- Postgres de Railway lo soporta nativo.

### El costo real (que suele subestimarse)

**a) Prisma no tiene contexto de sesión.** El pool reutiliza conexiones entre
requests. La variable debe fijarse dentro de la misma transacción:

```ts
await db.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.org_id', ${orgId}, true)`;
  return fn(tx);   // true = LOCAL, muere con la transacción
});
```

**Toda** consulta pasa a correr en transacción. Si el `set_config` se filtra
fuera de la transacción, una conexión reciclada arrastra el tenant anterior:
la fuga que RLS venía a evitar.

**b) El dueño de la tabla ignora RLS.** El detalle más caro de descubrir tarde:

```sql
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients FORCE  ROW LEVEL SECURITY;  -- ← sin esto no protege nada
```

Railway entrega un rol dueño de las tablas. Sin `FORCE`, RLS queda activado en
apariencia y **completamente inerte**. Lo correcto es además crear un rol de
aplicación sin `BYPASSRLS`.

**c) Las 18 tablas hijas necesitarían `organization_id`.** Una política no puede
mirar al padre sin un join en cada fila.

**d) `SUPER_ADMIN` necesita su propia política** (`app.is_platform_admin`), con
el riesgo de convertirse en un bypass permanente si queda mal escrita.

### Plan recomendado

Fase 2, y por etapas: primero las 5 tablas de mayor valor
(`patients`, `appointments`, `consultations`, `prescriptions`, `patient_documents`),
en modo auditoría antes de forzar. Con 40 clínicas en una sola base, RLS es la
diferencia entre "creemos que no hay fugas" y "la base no las permite".

---

## 8. Cambios necesarios en APIs

| Endpoint | Riesgo | Cambio |
|---|---|---|
| `/api/integrations/whatsapp/webhook` | **CRÍTICO** — `resolveOrganization()` hace `findFirst({isActive:true})`: con 2+ clínicas **todos los mensajes caen en la primera**. Conversaciones de pacientes ajenos en el consultorio equivocado | Resolver `instanceId → organizationId` vía `WhatsappConnection`. Si no resuelve: **descartar**, jamás adivinar |
| `/api/cron/reminders` | Procesa la cola global | Iterar por clínica y **saltar suspendidas** |
| `/api/v1/patients` | Correcto (usa `session.organizationId`) | Sin cambio funcional; falta rate limit por clínica |
| `/api/v1/appointments` | Igual | Igual |
| `/api/integrations/google/callback` | Vincula por `userId` | Validar que el usuario siga en la clínica |

El middleware **no requiere cambios estructurales**: `PUBLIC_PATHS` ya
contempla las rutas de máquina. Solo se suma `/admin` como zona de plataforma.

### El patrón que debe prohibirse

```ts
// PROHIBIDO en rutas de máquina:
const org = await db.organization.findFirst();   // "la primera que haya"
```

Con un solo consultorio funciona. Con dos, mezcla expedientes clínicos.

---

## 9. Estrategia de migración sin romper datos

Toda la fase 1 es **aditiva**. Ninguna columna se borra ni se renombra.

| Paso | Operación | Reversible |
|---|---|---|
| 1 | `ALTER TABLE organizations ADD COLUMN type/status/max_users` con default | Sí |
| 2 | Backfill: `status = ACTIVE` donde `is_active = true`, `SUSPENDED` si no | Sí |
| 3 | `CREATE TABLE clinic_users` | Sí |
| 4 | Backfill: un `ClinicUser` por cada `User` con `isPrimary = true` | Sí |
| 5 | `ALTER TABLE users ADD COLUMN is_platform_admin BOOLEAN DEFAULT false` | Sí |
| 6 | `CREATE TABLE whatsapp_connections` + fila con el `phone_number_id` actual | Sí |
| 7 | `CREATE INDEX CONCURRENTLY` para los índices compuestos | Sí |

El código viejo sigue funcionando en cada paso: lee `organizationId` e
`isActive`, que permanecen intactos. `User.organizationId` **no se elimina**.

**Regla de corte:** `npm run build` verde antes de cada `git push` (Railway
tira el deploy si falla el chequeo de tipos).

---

## 10. Riesgos técnicos

| # | Riesgo | Severidad | Mitigación |
|---|---|---|---|
| 1 | **Cero pruebas automatizadas** | **Crítico** | Antes de tocar aislamiento: suite mínima de fuga entre tenants. Es el riesgo que amplifica a todos los demás |
| 2 | Webhook con `findFirst` | **Crítico** | §8. Único punto donde hoy se mezclarían datos clínicos |
| 3 | Suspensión inefectiva por 7 días | Alto | Revalidar sesión contra la base |
| 4 | Fuga por omisión en código nuevo | Alto | Capas 1 y 2 de §6 |
| 5 | Credenciales que circularon por chat | Alto | Rotar **antes** de meter clínicas reales (ya estaba en `CLAUDE.md`) |
| 6 | `ClinicUser` mal migrado | Medio | Migración aditiva; `User.organizationId` intacto y reversible |
| 7 | RLS activado sin `FORCE` | Medio | Verificar con `pg_policies` + prueba que **debe** fallar |
| 8 | Ruido en el directorio médico | Bajo | Cross-org intencional, solo datos públicos |
| 9 | Sin límite de recursos por clínica | Bajo | Cuotas en fase 3 |

---

## 11. Orden recomendado de implementación

### Fase 0 — Red de seguridad (antes de tocar arquitectura)

- Pruebas de aislamiento: 2 clínicas semilla, verificar que A no ve nada de B.
- `npm run build` verde como criterio de corte.

### Fase 1 — Obligatorio para 40 consultorios

1. Enums `ClinicType` / `ClinicStatus` + `type`, `status`, `maxUsers`. *(aditivo)*
2. Tabla `WhatsappConnection` + `@@unique([provider, instanceId])`.
3. **Reescribir `resolveOrganization()`** → enrutamiento por instancia. *(agujero crítico)*
4. `isPlatformAdmin` + `requireClinicAccess()`.
5. Revalidación de sesión contra la base (aplica la suspensión).
6. `ClinicUser` + migración de datos desde `User.organizationId`.
7. Índices compuestos.
8. Panel `/admin` de SUPER_ADMIN.

### Fase 2 — Endurecimiento

9. `ClinicScope` tipado + `scopedDb()` con guardia.
10. RLS en las 5 tablas de mayor valor, con `FORCE` y rol sin `BYPASSRLS`.
11. `organization_id` en las tablas hijas (prerrequisito de 10).
12. Cuotas y rate limiting por clínica.

### Fase 3 — Diferible sin riesgo

13. `clinic.type` habilitando módulos (odontograma dental, etc.).
14. Job queue con worker propio.
15. Facturación por plan.
16. Renombre físico `organization_id → clinic_id`, si se decide.

### Lo que explícitamente NO se hace

- No se agrega `clinic_id` junto a `organizationId` (dos tenants en paralelo).
- No se separa la app por tipo de consultorio.
- No se codifican 3 usuarios fijos.
- No se borra información al suspender.
- No se migra a microservicios.
