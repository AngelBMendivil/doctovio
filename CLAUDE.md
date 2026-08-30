# Doctovio — mapa del proyecto

SaaS para consultorios médicos. Expediente, agenda, recetas, cobros y un
asistente de WhatsApp que agenda citas solo.

**Producción:** https://doctovio.com (Railway) · **Base:** PostgreSQL en Railway

---

## Arrancar

```powershell
cd C:\Users\angel\mvp-pacientes-saas
npm run dev
```

Usuarios demo: `admin@demo.com` · `doctor@demo.com` · `asistente@demo.com` —
contraseña `Demo1234!` para los tres.

**Antes de cada `git push`, corre `npm run build`.** Railway corre el chequeo
de tipos al desplegar; si falla, el despliegue se cae. En local lo ves en 40
segundos en vez de dar la vuelta completa.

**Pruebas:** `npm test` (o `npm run test:watch`). Corren en 2 segundos y NO
tocan la base: por ahora solo cubren lógica pura (`tests/unit/`). Las de
aislamiento entre consultorios están pendientes de que exista una base de
pruebas — **jamás se prueba contra producción**.

---

## Stack

Next.js 14 (App Router) · TypeScript · Prisma · PostgreSQL · Tailwind ·
componentes propios (NO shadcn) · React 18.3

**React 18, no 19:** se usa `useFormState` y `useFormStatus` de `react-dom`.
`useActionState` no existe aquí.

---

## Reglas duras (aprendidas a golpes)

**Las variables de entorno se leen en `lib/`, NUNCA dentro de `app/`.**
Next empaqueta los route handlers en la capa RSC y ahí `process.env` viene
`undefined`: el módulo truena al cargarse. Por eso existen
`lib/whatsapp/config.ts`, `lib/google/config.ts` y `lib/cron/config.ts`.

**Las citas se filtran por `startTime`, jamás por `scheduledDate`.**
`scheduledDate` es solo fecha y se guarda como medianoche UTC: en zonas de
México desplaza el día y las citas "desaparecen".

**Los botones de WhatsApp se cortan a 20 caracteres.** Si una etiqueta se pasa,
el paciente la toca, WhatsApp devuelve el texto CORTADO, no coincide con la
opción y el bot no entiende su propio botón. Ver `MAX_OPTION` en
`lib/conversation/machine.ts`.

**Un server action usado como `<form action={fn}>` debe devolver `void`.**
Si devuelve algo, el build falla. Para devolver estado, usa `useFormState` y la
firma `(prev, formData)`.

**No importar VALORES desde módulos `"use client"` hacia server components.**
Rompe el bundler RSC. Por eso `lib/prescription-template.ts` y
`lib/conversation/state.ts` existen: son archivos planos sin dependencias.

**Nada de `as never` para callar a TypeScript.** Ya nos explotó dos veces en
producción. Si el tipo no cuadra, arregla el tipo.

**Un mensaje entrante de WhatsApp se enruta por el NÚMERO que lo recibió,
nunca por el paciente.** El orden es `instanceId → organizationId →
(organizationId + phone) → paciente`. Si no resuelve, se descarta. Antes había
un `organization.findFirst()` ahí: con dos consultorios, todos los mensajes de
todos los pacientes caían en el primero. Ver `lib/whatsapp/routing.ts`. Jamás
uses `findFirst()` sobre `organizations` para deducir el consultorio.

**El JWT no se entera de nada.** Vive 7 días y es autocontenido: no sabe si el
consultorio fue suspendido ni si el usuario fue dado de baja. Por eso
`requireSession()` revalida contra la base. Si agregas otra puerta de entrada,
tiene que revalidar también, o suspender no suspende nada.

---

## Arquitectura: lo que importa

**El motor de agenda (`lib/services/scheduling.ts`) es la única puerta para
tocar citas.** La interfaz web, el asistente de WhatsApp y cualquier IA futura
pasan por ahí. Nadie escribe citas directo. Ahí viven las reglas: horario
laboral, bloqueos, reservas temporales, anticipación mínima, buffer.

**Doctovio es la fuente de verdad.** Google Calendar es un reflejo. Un fallo de
Google nunca tumba una operación de agenda: la cita queda creada y se encola
para reintentar (`syncStatus`).

**Los eventos personales de Google solo BLOQUEAN disponibilidad**, nunca se
vuelven citas. Los eventos que nosotros publicamos van marcados con
`doctovioAppointmentId` para no leerlos de vuelta como bloqueos — sin esa marca,
cada cita publicada le robaría su propio horario al médico.

**La máquina conversacional (`lib/conversation/machine.ts`) es determinista.**
Menús numerados, sin IA. Solo puede actuar llamando al motor de agenda.
Escala a un humano cuando no puede resolver.

**El estado de la conversación manda sobre el paso guardado.** Si la sesión no
está escalada pero la máquina quedó en `HUMAN`, se ignora y arranca del menú.
Sin eso, cerrar una conversación la dejaba muda para siempre.

**Ciclo de importaciones:** `lib/conversation/state.ts` existe solo para romper
`scheduling → reminders → orchestrator → machine → scheduling`. No le agregues
importaciones.

---

## Distinciones clínicas que el código respeta

**"No tiene alergias" ≠ "no le preguntamos".** Hay campos explícitos
(`allergiesNegated`, `chronicNegated`, `familyNegated`). En la receta:
"negadas" en gris vs "sin registro". Esa diferencia importa al recetar.

**El membrete es uno solo** (`components/documents/letterhead.tsx`). Receta y
referencia lo comparten. Lo que se configura en Configuración → Receta aplica a
ambos.

**Escribir no es guardar.** Los formularios de la consulta avisan en ámbar
cuando hay algo sin guardar. Se agregó porque un `revalidatePath` borraba lo
capturado y parecía que el sistema perdía datos.

**Las pestañas van en la URL** (`?tab=receta`), no en `useState`. Con estado
local se reiniciaban al guardar y el médico creía haber perdido su trabajo.

---

## Integraciones

**WhatsApp:** conectado con número de prueba de Meta. App ID `1454327396712958`.
El token es permanente (usuario del sistema `doctovio-api`). El webhook valida
firma HMAC. Ojo: la WABA debe estar suscrita a la app vía
`POST /{WABA_ID}/subscribed_apps` — la consola no lo hace sola y falla en
silencio ("shadow delivery").

**Recordatorios:** cola en `reminder_jobs`, endpoint `/api/cron/reminders`
protegido con `CRON_SECRET`, disparado por cron-job.org cada 5 min. Depende de
la plantilla `recordatorio_cita` aprobada por Meta.

**Google Calendar:** código completo, SIN credenciales. Al configurar
`GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` se activa solo.

**Middleware:** `/api/integrations` y `/api/cron` están fuera de la sesión — los
llama una máquina, no un navegador. Se protegen con firma HMAC y con secreto,
respectivamente. Si agregas un endpoint para máquinas, agrégalo a `PUBLIC_PATHS`
o el middleware lo manda al login con un 307.

---

## Pendientes conocidos

- **Cero pruebas automatizadas.** El riesgo real del proyecto.
- **Multiconsultorio: a medias.** El aislamiento por `organizationId` ya está en
  25 modelos y los 23 servicios lo exigen. El enrutamiento de WhatsApp y la
  suspensión ya se arreglaron (25 ago 2026). Falta: `type`/`status`/`maxUsers`
  en `Organization`, `SUPER_ADMIN`, `ClinicUser` (hoy un usuario pertenece a un
  solo consultorio) y RLS. Ver `MULTITENANT.md`.
- **Un paciente nuevo no puede agendar por WhatsApp** — escala a recepción.
- **Verificación de negocio en Meta** pendiente: sin ella no hay número real.
- **Credenciales por rotar:** token de WhatsApp, App Secret y contraseña de la
  base circularon por un chat.
- Los expedientes creados antes del arreglo de `birthDate` tienen edad 0.

---

## Estado del proyecto (25 ago 2026)

**Lo que se hizo hoy: multiconsultorio, primera tanda.** Dos commits en `main`,
ya desplegados: `7ef43c3` (aislamiento de WhatsApp + suspensión efectiva) y
`f21896c` (alta de consultorios). Análisis completo en `MULTITENANT.md`.

**Hallazgo que reencuadró todo:** Doctovio YA era multi-tenant. `organizationId`
vive en 25 modelos y los 23 servicios lo exigen como primer parámetro. NO hacía
falta agregar `clinic_id`: se decidió que `Organization` ES el consultorio y
solo se le suman los campos que falten. Agregar un `clinic_id` en paralelo
habría dejado dos conceptos de tenant compitiendo.

**Los tres `findFirst` de la misma familia, TODOS cerrados:**
1. ~~Webhook de WhatsApp~~ — enruta por `instanceId` vía `whatsapp_connections`.
   Ver `lib/whatsapp/routing.ts`.
2. ~~Login~~ — correo único global + `findUnique`.
3. ~~Cron de recordatorios~~ — filtra consultorios suspendidos y reparte el
   lote entre consultorios (26 ago 2026).

**Migraciones al día.** `20260825120000_whatsapp_conexiones` y
`20260825190000_correo_unico_global` aplicadas en producción. Recordatorio:
Railway solo corre el build, **las migraciones se aplican a mano** con
`npx prisma migrate deploy`.

**Cómo dar de alta un consultorio** (mientras no exista el panel):

```powershell
copy scripts\consultorio-ejemplo.json mi-consultorio.json
npm run consultorio -- crear mi-consultorio.json
npm run consultorio -- listar
```

Los JSON de alta llevan contraseñas en texto plano y están en `.gitignore`.

---

### Lo siguiente, en orden

**1. 🔴 Rotar credenciales.** Token de WhatsApp, App Secret y contraseña de la
base circularon por un chat. Pendiente desde julio. Mientras sigan vivos, todo
el blindaje tiene una puerta abierta por detrás. **Antes de meter consultorios
de terceros.**

**2. 🟡 Pruebas: arrancadas, a medias.** Ya hay 35 en `tests/unit` (vitest),
solo de lógica pura: edad, IMC, cifrado de secretos, normalización de teléfonos
y el matcher de opciones del bot. Encontraron un bug real a la primera (ver
abajo). **Falta lo que más vale: aislamiento entre consultorios**, y eso
necesita una base de pruebas — no hay Docker ni Postgres local en esta máquina.
Cuando la haya, van en `tests/integration/` con su propia guarda que verifique
a qué base apunta antes de escribir.

**3. 🟡 Fase 1 restante:** `type` / `status` / `maxUsers` en `Organization`
(hoy solo hay `isActive`), `SUPER_ADMIN` + panel `/admin`, índices compuestos
(a 40 consultorios la agenda se va a sentir).

**4. 🟢 Diferible:** `ClinicUser` (un doctor en varios consultorios), RLS en
Postgres — ojo con `FORCE ROW LEVEL SECURITY`, sin eso el dueño de la tabla la
ignora y en Railway ese es justo el caso. Detalle en `MULTITENANT.md` §7.

**Bug que encontraron las pruebas (26 ago 2026).** `pick()` en
`machine.ts` estaba declarada `number | null` pero devolvía el `-1` de
`findIndex`. Consecuencia: las 12 comprobaciones `if (choice === null)` —las
que repiten el menú cuando el paciente escribe algo que el bot no entiende—
**nunca se cumplían**, y `pick(...) ?? menuFromIntent(intent)` jamás entraba al
respaldo, porque `??` solo actúa sobre null/undefined. `menuFromIntent` era
código muerto: el bot no interpretaba lenguaje libre, solo números y etiquetas
exactas. Ya corregido, con prueba de regresión.

**Revisado y sano** (no volver a auditarlo): `google.ts`, `schedule.ts`,
`machine.ts` y `preregistration.ts` acotan bien por `organizationId`. El
directorio médico cruza consultorios A PROPÓSITO y solo expone datos públicos.

---

## Estado del proyecto (18 jul 2026)

**Estrategia acordada.** La propuesta de valor de Doctovio es un paquete:
sistema + sitio web del médico + asistente de IA en WhatsApp. Antes de construir
la versión "plug and play" (multiconsultorio), se valida el modelo con una fase
**friends and family** (3-5 consultorios conocidos; la Dra. Mendívil es el
primer caso). Requisitos de higiene antes de meter usuarios reales: rotar
credenciales y tener claro que hoy el `findFirst` solo aguanta un consultorio.

**Sitio de la Dra. Mendívil — HECHO (v1).** Vive en `sitio-dra-mendivil/`.
HTML estático de una sola página con la marca Doctovio. Sirve con `server.js`
(Node puro, sin dependencias) + `package.json` + `railway.json`. Guía en
`DESPLEGAR.md`.
- Datos reales cargados: dirección (José Clemente Orozco #2468-302, Zona Río),
  tel 664 648 6605, correo dratrinimendivil@gmail.com, mapa de Google embebido.
- **UAG, no UNAM.** El usuario confirmó que es Universidad Autónoma de
  Guadalajara. (Los documentos originales decían UNAM — falta que confirme
  contra el título físico.)
- Fotos profesionales en `img/` (hero, retrato, consulta), recortadas. Ojo:
  se ven de estudio/IA; **la doctora debe aprobarlas como imagen fiel** antes de
  publicar (publicidad médica).
- **Nunca dice "especialista"** — cédula 887394 es de licenciatura. Riesgo
  COFEPRIS. Todo es "médica cirujana con formación en".
- Se quitó el segmento de Trayectoria a pedido del usuario.
- **Formulario de opiniones (estrellas + comentario): se ve pero NO guarda
  nada.** Falta conectarlo con Doctovio para almacenar y moderar reseñas.

**Despliegue en Railway — EN PROCESO.** Servicio nuevo `pacific-hope` en el
proyecto, conectado al repo `AngelBMendivil/doctovio`, branch `main`, con
**Root Directory = `sitio-dra-mendivil`**. Para que el puerto cuadre: variable
`PORT=8080` y el dominio apunta a 8080. Aún por confirmar deploy en verde y
generar dominio. Railway ofrece comprar `dratrinimendivil.com` por ~$11 USD/año
(aún no comprado). Plan: validar con la URL `.up.railway.app` gratis antes de
comprar dominio.

**WhatsApp / asistente de IA — parcial.**
- Plantilla `recordatorio_cita`: **En revisión** en Meta (17 jul 2026). Solo
  bloquea los RECORDATORIOS automáticos, NO el agendado. El bot agenda sin
  plantilla dentro de la ventana de 24 h.
- El bot vive en el **número de prueba de Meta**, no en el 664 real. El botón de
  WhatsApp del sitio apunta al 664 → hoy el bot NO contestaría ahí. Para número
  real: verificación de negocio + registrar número en la API (deja de ser
  WhatsApp normal) + plantillas + `subscribed_apps`.
- Se puede probar el flujo de agendar ya, en el número de prueba, con el
  teléfono en la lista de permitidos.

**Plantilla `recordatorio_cita`: APROBADA** (Meta la muestra como "Activa:
calidad pendiente" el 18 jul 2026 — "activa" = aprobada, "calidad pendiente"
solo es que aún no manda mensajes para medir calidad).

**Visión del asistente — dos modos, un solo cerebro (distinguidos por número).**
- **Asistente ↔ Paciente** (YA EXISTE): menús, agenda según reglas de negocio.
- **Doctora ↔ Asistente** (POR CONSTRUIR): la doctora le escribe al MISMO bot y
  entra en modo admin: ver citas de hoy/semana, reagendar, cancelar. El bot la
  reconoce por su número (el 664) y le da un menú distinto al del paciente.
  Las operaciones ya existen en `scheduling.ts` (`consultarAgenda`,
  `reagendarCita`, `cancelarCita`, `confirmarAsistencia`); falta la capa de
  conversación en modo doctora. Empezar con MENÚ numerado (no IA), agregar
  lenguaje natural después.
- Esto resuelve el número: el bot vive en un número dedicado nuevo; la doctora
  conserva su 664 y desde ahí le habla al bot → el bot la trata como admin.

**Número dedicado para el bot.** Usar un número aparte (no el 664 personal) para
que la doctora conserve su WhatsApp normal. Puede ser chip/SIM nuevo, Twilio o
fijo — solo debe poder recibir el código de verificación (SMS o llamada).
IMPORTANTE: conectar por **Meta Cloud API directo** (lo que Doctovio ya usa),
NO por el producto de WhatsApp de Twilio (eso obligaría a reescribir toda la
integración). Twilio, si se usa, es solo el proveedor del número. Y el botón de
WhatsApp del sitio debe apuntar al número del bot, no al 664.

**Lo siguiente cuando se retome:** (1) confirmar deploy del sitio en verde y
generar dominio; (2) confirmar qué aprobó Meta (¿verificación de negocio?) para
salir del número de prueba; (3) elegir y registrar el número dedicado del bot;
(4) construir el modo doctora (admin por WhatsApp); (5) decisiones de la
doctora: foto aprobada, título UAG, si ofrece estética.

---

## Cómo trabajar aquí

1. Antes de construir, **lee el código que vas a tocar**. Este proyecto tiene
   trampas que no se ven desde afuera.
2. Cuando algo falle, **pide el log antes de teorizar**. Tres veces se
   diagnosticó mal por adivinar en vez de leer el mensaje de error.
3. El sandbox de Linux **trunca archivos**: `tsc` y `grep` desde ahí dan
   resultados falsos. Usa la herramienta de lectura del host, y para verificar
   tipos usa `npm run build` en la máquina del usuario.
4. Los cambios en `tailwind.config.ts` **no recargan en caliente**: hay que
   reiniciar el server.
