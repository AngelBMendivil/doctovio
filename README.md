# MVP SaaS — Gestión de Pacientes, Citas y Expedientes Clínicos

Proyecto base funcional en Next.js 14 (App Router) + TypeScript + Prisma + PostgreSQL, preparado para desplegarse en Railway con almacenamiento en Cloudflare R2 y correo transaccional vía Resend.

## Qué incluye este scaffold (implementado end-to-end)

- **Autenticación** por sesión JWT en cookie httpOnly (`src/lib/auth`), sin dependencias de terceros.
- **Multiempresa**: toda consulta pasa `organizationId` explícitamente desde la sesión; ver `src/lib/services/*`.
- **RBAC** (Admin / Médico / Asistente) centralizado en `src/lib/auth/rbac.ts`, verificado en cada Server Action.
- **Pacientes**: alta completa, alta rápida sin cita, detección de duplicados, expediente con línea de tiempo.
- **Agenda**: creación de citas con validación de traslapes, confirmación, cancelación, no-show, reprogramación con historial.
- **Sala de espera / visitas**: tablero de 4 columnas, alta de paciente sin cita, registro de llegada desde una cita.
- **Consultas**: inicio desde una visita, signos vitales (con IMC automático e historial), diagnósticos, bloqueo al finalizar, notas adicionales (addendum) para correcciones posteriores.
- **Recetas y órdenes médicas**: folio consecutivo por organización generado en transacción, emisión, cancelación, versión de receta (supersede).
- **Documentos**: subida a Cloudflare R2 (S3-compatible), metadata en PostgreSQL, URL firmada temporal para descarga, validación de tipo/tamaño.
- **Referencias médicas entre doctores**: selección explícita de qué se comparte, autorización del paciente, bitácora de accesos, resumen autorizado (nunca expediente completo), aceptar/rechazar/responder/cerrar.
- **Directorio médico** interno multi-organización (solo datos públicos del perfil).
- **Notificaciones** por correo vía Resend con registro en `notification_logs`; WhatsApp Business Cloud API preparado (deshabilitado por defecto).
- **Auditoría** transversal (`src/lib/services/audit.ts`) invocada desde las mutaciones y consultas sensibles.
- **API REST v1** (`/api/v1/patients`, `/api/v1/appointments`) como base para integraciones futuras.
- **Dashboard** con indicadores del día y accesos rápidos.

## Qué queda como siguiente paso (no bloqueante para el MVP)

- UI de prerregistro público por token/QR (el modelo `PublicFormToken` y el generador de tokens en `src/lib/utils/tokens.ts` ya existen; falta la página pública y el flujo de envío).
- Gestión de usuarios/roles desde la UI (hoy se listan en Configuración; el alta se hace vía `createUser()` en `src/lib/services/users.ts`, falta el formulario).
- Plantillas de receta/orden en PDF descargable (hoy se muestran en pantalla; falta generación de PDF, sugerido con `@react-pdf/renderer` o similar).
- Envío real de WhatsApp (arquitectura y contrato ya implementados en `src/lib/services/notifications.ts`; falta activar credenciales de Meta).
- Pruebas automatizadas (unitarias de servicios y e2e del flujo crítico).

## Requisitos previos

- Node.js 20+
- PostgreSQL 15+ (Railway lo provee)
- Cuenta de Resend (correo)
- Bucket de Cloudflare R2 (o S3/Supabase Storage)

## Puesta en marcha local

```bash
cp .env.example .env       # completa las variables (DATABASE_URL, AUTH_SECRET, RESEND_API_KEY, STORAGE_*)
npm install
npm run prisma:migrate     # crea las tablas en tu base de datos local
npm run db:seed            # datos de ejemplo: organización, usuarios, un paciente
npm run dev
```

Usuarios de ejemplo tras el seed (contraseña `Demo1234!`):

- `admin@demo.com` — Administrador
- `doctor@demo.com` — Médico
- `asistente@demo.com` — Asistente

## Despliegue en Railway

1. Crea un proyecto en Railway y agrega un servicio **PostgreSQL** (copia el `DATABASE_URL` generado).
2. Agrega un servicio a partir de este repositorio (Node/Next.js se detecta automáticamente).
3. Configura las variables de entorno del `.env.example` en el servicio de la app (Railway → Variables).
4. En el primer deploy, corre las migraciones: `npm run prisma:deploy` (agrégalo como *Release Command* o ejecútalo una vez desde una shell de Railway).
5. Opcional: ejecuta `npm run db:seed` una sola vez para datos de ejemplo (no usar en producción real).
6. Configura un dominio propio y actualiza `NEXT_PUBLIC_APP_URL`.
7. Repite el proceso para ambientes de `staging` y `production` como proyectos/servicios independientes en Railway, cada uno con su propia base de datos.

## Estructura de carpetas

```
prisma/schema.prisma        Modelo de datos completo (ver Etapa 3)
prisma/seed.ts               Datos de ejemplo
src/app/(auth)/login         Login
src/app/(app)/...            Rutas protegidas (dashboard, pacientes, agenda, sala de espera, consultas, referencias, directorio, configuración)
src/app/api/v1/...           API REST para integraciones futuras
src/lib/auth/                Sesión, hash de contraseñas, RBAC
src/lib/services/            Lógica de negocio por dominio (una función = una operación, siempre recibe organizationId)
src/lib/actions/             Server Actions: validan con Zod, verifican permisos, llaman a services/, revalidan cache
src/lib/validations/         Esquemas Zod por módulo
src/lib/storage/r2.ts        Cliente S3-compatible para Cloudflare R2
src/lib/email/               Cliente Resend + plantillas HTML
src/components/ui/           Primitivos de interfaz (botón, input, card, badge...) estilo shadcn, sin dependencias externas de UI
src/middleware.ts            Guard global de autenticación
```

## Notas de seguridad implementadas

- Contraseñas con bcrypt (10 rounds).
- Sesión firmada con JWT (HS256) en cookie httpOnly, `secure` en producción, `sameSite=lax`.
- Todo acceso a datos exige `organizationId` explícito — no hay una sola consulta "global" a `db.patient`, `db.appointment`, etc. sin ese filtro (excepto el directorio médico, que es intencionalmente cross-organización pero solo expone datos públicos del perfil).
- Documentos: solo PDF/JPG/JPEG/PNG, máximo 15 MB, URL de descarga firmada con expiración de 5 minutos.
- Auditoría no bloqueante: si falla el registro de auditoría, no se cae la operación principal (se loguea el error).
- RBAC verificado en cada Server Action, no solo ocultando botones en la UI.
