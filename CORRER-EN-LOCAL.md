# Correr el MVP de pacientes en local (Windows, sin Docker)

Guía para levantar el proyecto en tu máquina usando **PostgreSQL instalado directamente en Windows**. Stack: Next.js 14 + Prisma + PostgreSQL.

## Paso 1 — Instalar Node.js (si no lo tienes)

Comprueba en PowerShell:

```powershell
node -v
```

Si no aparece una versión 20 o superior, descarga e instala Node.js LTS desde https://nodejs.org (elige el instalador Windows .msi). Cierra y reabre PowerShell después de instalar.

## Paso 2 — Instalar PostgreSQL

1. Descarga el instalador de PostgreSQL 15 (o 16) para Windows desde:
   https://www.postgresql.org/download/windows/ → botón "Download the installer".
2. Ejecuta el instalador. Durante la instalación:
   - **Contraseña del usuario `postgres`:** elige una y **anótala** (la necesitarás en el Paso 3). Por ejemplo `postgres123`.
   - **Puerto:** deja `5432` (el predeterminado).
   - El resto, siguiente/siguiente. Puedes desmarcar "Stack Builder" al final.
3. Al terminar, PostgreSQL queda corriendo como servicio de Windows automáticamente.

## Paso 3 — Poner tu contraseña en el archivo .env

Abre el archivo `.env` del proyecto y busca esta línea:

```
DATABASE_URL="postgresql://postgres:TU_PASSWORD@localhost:5432/mvp_pacientes?schema=public"
```

Reemplaza `TU_PASSWORD` por la contraseña que elegiste en el Paso 2. Ejemplo:

```
DATABASE_URL="postgresql://postgres:postgres123@localhost:5432/mvp_pacientes?schema=public"
```

> Si tu contraseña tiene caracteres especiales como `@`, `:`, `/` o `#`, hay que codificarlos en la URL. Lo más simple es usar una contraseña solo con letras y números.

## Paso 4 — Crear la base de datos

La instalación de PostgreSQL incluye la herramienta `psql`. Crea la base con este comando (te pedirá la contraseña del Paso 2):

```powershell
& "$env:ProgramFiles\PostgreSQL\16\bin\createdb.exe" -U postgres mvp_pacientes
```

> Si instalaste la versión 15, cambia `16` por `15` en la ruta. Si `createdb` no funciona, ábrelo desde el menú Inicio: busca **pgAdmin**, conéctate, clic derecho en "Databases" → "Create" → "Database" → nombre `mvp_pacientes`.

## Paso 5 — Instalar dependencias, migrar y arrancar

Desde la carpeta del proyecto en PowerShell:

```powershell
# 1. Instalar dependencias del proyecto
npm install

# 2. Crear las tablas en la base (primera vez crea la migración "init")
npm run prisma:migrate

# 3. Cargar datos de ejemplo (organización, usuarios, un paciente)
npm run db:seed

# 4. Arrancar la app en modo desarrollo
npm run dev
```

Cuando termine, abre **http://localhost:3000** en el navegador.

## Usuarios de ejemplo

Contraseña para los tres: **`Demo1234!`**

| Correo             | Rol           |
|--------------------|---------------|
| admin@demo.com     | Administrador |
| doctor@demo.com    | Médico        |
| asistente@demo.com | Asistente     |

## Qué funciona y qué no en local

El `.env` incluido ya trae todo lo necesario para arrancar. Dos servicios externos quedan como **placeholder** porque no hacen falta para probar la app:

- **Correo (Resend):** solo se usa al *enviar* una notificación por email. Con el placeholder la app corre normal; únicamente fallará la acción puntual de enviar un correo. Para activarlo, pon un `RESEND_API_KEY` real en `.env`.
- **Almacenamiento de documentos (Cloudflare R2 / S3):** solo se usa al *subir o descargar* un documento de paciente. Todo lo demás funciona sin él. Para activarlo, pon las credenciales `STORAGE_*` reales.

Todo el núcleo clínico (pacientes, citas, sala de espera, consultas con signos vitales, diagnósticos, recetas, órdenes y referencias) funciona 100% en local sin esos servicios.

## Comandos útiles

```powershell
# Ver la base de datos en una interfaz visual (Prisma Studio)
npm run prisma:studio

# Volver a arrancar la app (después de la primera vez, solo necesitas esto)
npm run dev
```

## Problemas comunes

- **`node` o `npm` no se reconoce:** Node.js no está instalado o no reabriste PowerShell tras instalarlo. Cierra y abre PowerShell de nuevo.
- **Error de conexión a la base (`P1001` / autenticación):** revisa que la contraseña en `DATABASE_URL` sea exactamente la del usuario `postgres`, y que el servicio "postgresql" esté corriendo (búscalo en Servicios de Windows o en pgAdmin).
- **`createdb` no se reconoce:** usa la ruta completa del Paso 4, o crea la base desde pgAdmin.
- **El puerto 5432 ya está en uso:** tienes otra instancia de PostgreSQL. Usa esa (ajusta usuario/clave en `DATABASE_URL`) o cambia el puerto de la nueva instalación.
- **`npm install` falla:** confirma que tu Node es 20+ con `node -v`.

## Nota

Este `.env` y el `AUTH_SECRET` generado son **solo para desarrollo local**. No los uses en producción. Para desplegar (Railway u otro), sigue la sección de despliegue del `README.md` con credenciales reales y un secreto nuevo.

---

### ¿Prefieres Docker más adelante?

Si en el futuro instalas Docker Desktop, el proyecto también incluye un `docker-compose.yml` listo. En ese caso, cambia la línea `DATABASE_URL` del `.env` a:
`postgresql://mvp:mvp@localhost:5432/mvp_pacientes?schema=public` y corre `docker compose up -d` en vez de instalar PostgreSQL.
