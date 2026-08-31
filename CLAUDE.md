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

**Pruebas:** `npm test` — 86 pruebas de lógica pura en `tests/unit/`, 2
segundos, sin tocar la base.

**Verificación:** `npm run verificar` — comprueba aislamiento entre
consultorios, IDOR, enrutamiento de WhatsApp, horarios, identidad de acceso,
bitácora y folios duplicados contra datos REALES. Es de **solo lectura** (ni un
create, update, delete o transacción), y por eso puede correrse contra
producción.

**Nunca corras `vitest` contra producción.** Una suite limpia datos entre
casos; un `deleteMany` mal filtrado en un `afterEach` borra pacientes y
expedientes. Lo que falta —concurrencia, doble reserva, IDOR por HTTP— necesita
escribir, y para eso hace falta una base separada.

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

- **Pruebas: 86 unitarias + 18 verificaciones.** Falta todo lo que exige
  escribir: concurrencia, doble reserva, IDOR por HTTP y flujos de interfaz.
  Necesitan una base de pruebas; esta máquina no tiene Docker ni Postgres local.
- **Multiconsultorio: funcionando.** Aislamiento verificado con dos
  consultorios reales. Falta RLS en Postgres como segunda capa
  (ver `MULTITENANT.md` §7) y los índices compuestos para cuando haya volumen.
- **Un paciente nuevo no puede agendar por WhatsApp** — escala a recepción.
- **Verificación de negocio en Meta** pendiente: sin ella no hay número real.
- **Credenciales por rotar:** token de WhatsApp, App Secret y contraseña de la
  base circularon por un chat.
- Los expedientes creados antes del arreglo de `birthDate` tienen edad 0.

---

## Estado del proyecto (30 ago 2026)

**Análisis completo en `MULTITENANT.md`.** El multiconsultorio se hizo en dos
tandas: 25 ago (aislamiento de WhatsApp, suspensión efectiva, alta por script)
y 30 ago (panel Master, catálogo, cobranza, códigos de consultorio).

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
   lote entre consultorios (30 ago 2026).

**Migraciones al día.** `20260825120000_whatsapp_conexiones` y
`20260825190000_correo_unico_global` aplicadas en producción. Recordatorio:
Railway solo corre el build, **las migraciones se aplican a mano** con
`npx prisma migrate deploy`.

**Administrador Maestro.** Panel en `/master` (Dashboard, Consultorios,
Usuarios, Cobranza, Productos, Auditoría). `/admin` redirige ahí.

Es una BANDERA (`User.isPlatformAdmin`), NO un rol. `UserRoleName` alimenta la
matriz de `rbac.ts`, donde cada permiso lista los roles que lo tienen; un
`SUPER_ADMIN` ahí sería un rol que existe DENTRO de un consultorio, justo lo
contrario de lo que es. Al ser ortogonal, la misma persona puede ser ADMIN de un
consultorio y operador de plataforma. **No da acceso a datos clínicos:** el
panel maneja conteos y cobranza, nunca pacientes.

Se nombra desde el script, no desde una pantalla — el primero no puede crearse
desde dentro, y darse el privilegio a uno mismo por la interfaz es lo que no
debe poder hacerse:

```powershell
npm run consultorio -- maestro tu@correo.com
npm run consultorio -- maestros
```

**Cobranza: `ClinicPayment` ≠ `Payment`.** `Payment` es el cobro del PACIENTE al
consultorio por su consulta. `ClinicPayment` es el pago del CONSULTORIO a
Doctovio. Van separadas para que el reporte de ingresos que exporte un médico no
lleve de regalo cuánto te paga a ti. La captura es manual.

**El precio NO vive en el código.** Vive en la tabla `products`
(`DOCTOVIO_BASE`, 20 USD/mes). Al contratar se COPIA a `Subscription`, y al
emitir se copia otra vez a `BillingCycle`. Por eso subirle el precio al catálogo
no le cambia el cobro a quien ya firmó ni reescribe una mensualidad histórica.
Si algún día encuentras un `20` en el código, está mal.

**"Vencido" no se guarda, se DERIVA** (`cycleState()` en
`platform-billing.ts`). Guardarlo obligaría a un proceso nocturno que recorriera
la tabla; el día que fallara, el panel mostraría al corriente a alguien vencido.
Derivado no puede desincronizarse.

**La generación de mensualidades es idempotente** gracias a
`@@unique([subscriptionId, period])`. Correrla dos veces el mismo mes no duplica
el cobro.

**Cada consultorio tiene un código INMUTABLE** (`Organization.code`: CLP, DSO).
Va dentro del nombre de acceso de sus usuarios (`clp.carlos`), así que
cambiarlo dejaría a esa gente sin poder entrar. Se define UNA vez, al dar de
alta; ninguna pantalla lo edita después, ni el Master.

**Todo usuario necesita correo**, incluidos los secundarios: sin él no hay a
dónde mandar el restablecimiento de contraseña ni los avisos, y una cuenta que
solo se recupera pidiéndole al Master que la toque a mano no es recuperable de
verdad.

**El alias `clp.carlos` es una vía ADICIONAL de acceso, no un sustituto.** El
login acepta correo o alias. Por eso el input del login es `type="text"` y NO
`type="email"`: con email el navegador rechaza `clp.carlos` por no llevar
arroba y el formulario ni siquiera se envía.

**El rol NO va en el nombre de usuario.** Si la secretaria pasa a
administrativa conserva `clp.carlos` y solo cambia `primaryRole`.

**El Master NO ve datos clínicos.** El panel maneja conteos, cobranza, usuarios
y catálogo. Ve que una clínica tiene 300 pacientes, nunca quiénes son. "Ver como
consultorio" se dejó fuera a propósito: cruzaría esa frontera.

**Ningún consultorio se suspende solo por falta de pago.** El panel marca en
rojo a los vencidos, pero suspender es siempre una acción deliberada de una
persona: cortarle a un médico el expediente de su paciente a media consulta
porque una transferencia no se capturó no es un daño comercial.

**`status` e `isActive` se escriben JUNTAS**, siempre desde `setClinicStatus()`.
`status` es el estado comercial e `isActive` la bandera operativa que consultan
el middleware, WhatsApp y el cron. Actualizar una sin la otra deja al
consultorio suspendido en el panel pero operando en la práctica.

**Cómo dar de alta un consultorio** (el alta sigue siendo por script):

```powershell
copy scripts\consultorio-ejemplo.json mi-consultorio.json
npm run consultorio -- crear mi-consultorio.json
npm run consultorio -- listar
```

Los JSON de alta llevan contraseñas en texto plano y están en `.gitignore`.

---

### Lo que se hizo el 30 ago 2026

**Panel del Administrador Maestro en `/master`** — Dashboard con KPIs y
gráficas, Consultorios (alta desde el panel, con pestañas de Resumen, Usuarios,
Pagos, Actividad y Configuración), Usuarios, Cobranza, Productos y Auditoría.
`/admin` redirige ahí.

**Catálogo, suscripciones y mensualidades.** El precio vive en `products`
(`DOCTOVIO_BASE`, 20 USD/mes) y se congela dos veces: al contratar en
`Subscription` y al emitir en `BillingCycle`.

**Código de consultorio y alias de acceso.** `TRI`, `CON`; usuarios
`clp.carlos`. El código es inmutable. El correo es obligatorio para todos y el
alias es una vía adicional de entrada.

**Dos bugs encontrados al validar contra la matriz de procesos, ya corregidos:**

1. *El turno partido se borraba solo.* El editor de horarios agrupaba con
   `new Map(rows.map(r => [r.weekday, r]))`, que se queda con el último rango
   del día. Como el alta crea 9-14 y 16-19, el médico abría Configuración, veía
   solo la tarde, guardaba y perdía la mañana sin aviso.
2. *Folios que chocan en concurrencia.* Tres copias de `count()+1` con el mismo
   error, y un comentario que afirmaba falsamente que la transacción bastaba.
   En READ COMMITTED dos transacciones cuentan lo mismo. Ahora hay un generador
   único que toma un candado sobre la fila del consultorio antes de contar.

**Verificación contra producción: 18 PASS, 0 FAIL.** Con dos consultorios
reales: `[CON]` no alcanza ningún paciente, cita ni documento de `[TRI]`, ni
por listado ni por id directo.

---

### Lo siguiente, en orden

**1. 🔴 Rotar credenciales.** Token de WhatsApp, App Secret y contraseña de la
base circularon por un chat. Pendiente desde julio. Mientras sigan vivos, todo
el blindaje tiene una puerta abierta por detrás. **Antes de meter consultorios
de terceros.**

**2. 🟡 Lo que las pruebas NO cubren.** 86 unitarias y 18 verificaciones, pero
todo lo que exige ESCRIBIR sigue sin probarse: concurrencia y doble reserva
(SCH-04), el candado de folios, IDOR por HTTP (API-01) y los flujos de
interfaz. Necesitan una base de pruebas donde se pueda ensuciar y limpiar —
esta máquina no tiene Docker ni Postgres local. Cuando la haya, van en
`tests/integration/` con guarda propia que verifique a qué base apunta antes de
escribir una sola fila.

**3. 🟡 Índices compuestos.** A 40 consultorios la agenda se va a sentir. Hoy
no duele: hay dos.

**4. 🟢 Diferible:** `ClinicUser` (un doctor en varios consultorios), RLS en
Postgres — ojo con `FORCE ROW LEVEL SECURITY`, sin eso el dueño de la tabla la
ignora y en Railway ese es justo el caso. Detalle en `MULTITENANT.md` §7.

**Bug que encontraron las pruebas (30 ago 2026).** `pick()` en
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
