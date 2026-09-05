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

**Pruebas:** `npm test` — 141 de lógica pura en `tests/unit/`, 3 segundos, sin
tocar la base. `npm run test:integration` — 73 contra la base de PRUEBAS
(`doctovio_test`), ~70 s porque van por red. Cubren concurrencia y escrituras
cruzadas entre consultorios, que es lo que no se puede probar de otra forma.

**Verificación:** `npm run verificar` — comprueba aislamiento entre
consultorios, IDOR, enrutamiento de WhatsApp, horarios, identidad de acceso,
bitácora y folios duplicados contra datos REALES. Es de **solo lectura** (ni un
create, update, delete o transacción), y por eso puede correrse contra
producción.

**La base de pruebas es `doctovio_test`**, una copia de producción en el mismo
servidor de Railway. Su credencial vive en `.env.test` (no versionado).
`tests/integration/setup.ts` corre ANTES que cualquier módulo, verifica la fila
`_qa_marker` y reescribe `DATABASE_URL`; sin eso los servicios escribirían en
producción, porque usan el singleton de `@/lib/db`. Las pruebas NO borran nada:
cada corrida crea su consultorio con código único y lo deja.

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

**Y "hoy" también es el del consultorio.** `new Date().toISOString().slice(0,10)`
da el día en UTC: en Tijuana cambia de día a las 5 de la tarde, y la sala de
espera perdía a esa hora el panel de registro y toda la lista de atención —
recepción se quedaba sin poder pasar pacientes ni mandar prerregistros en pleno
turno vespertino. Usa `hoyEnZona(await getClinicTimezone(orgId))`. Estaba en la
sala de espera, en consultas y en la pantalla de cobro.

**Lo que NO se tocó:** la ventana del día en `listTodayBoard` sigue en la zona
del servidor, y debe seguir así. Las horas de cita se guardan como si la zona
del servidor fuera la del consultorio (`new Date("2026-09-04T18:00:00")` sin
huso), así que mover la ventana a la zona real dejaría fuera las citas de la
mañana. Las dos cosas hay que arreglarlas juntas o ninguna.

**El día termina en la zona del CONSULTORIO, nunca en la del servidor.**
Railway corre en UTC. `endOfAppointmentDay` usaba `setHours(23,59,59)` y en
Tijuana eso adelanta el vencimiento siete horas: un enlace de prerregistro
generado a las 19:09 hora local nació vencido dos horas antes, y el paciente
leyó "el enlace expiró" en el enlace que le acababan de mandar. Para cualquier
cálculo de "el día", usa `finDelDiaEn()` de `lib/utils/timezone.ts`.

**El enlace de prerregistro se reenvía desde el EXPEDIENTE del paciente**, no
solo desde la sala de espera. La sala va por día: con una cita de la semana que
entra había que adivinar a qué fecha navegar para encontrar el botón. Generar
uno nuevo desde `/preregistrations` NO sirve para esto — ese token no está
ligado a la cita ni al paciente, y convertirlo crea un expediente duplicado del
que ya existe.

**Y un enlace nunca puede nacer vencido.** Aun con la zona correcta, agendar de
tarde una cita del mismo día dejaba minutos de vida. `preRegExpiry()` pone un
piso de 48 horas. Regla general: toda vigencia derivada de otra fecha necesita
un piso contra el momento de creación.

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

**Validar disponibilidad FUERA de la transacción no valida nada.** `crearCita`
comprobaba los horarios ocupados antes de abrir la transacción: dos
confirmaciones simultáneas veían el mismo hueco libre y ambas agendaban. Cinco
a la vez creaban cinco citas — cinco pacientes con el mismo médico a la misma
hora. La comprobación buena va DENTRO, después de que `generateFolio` toma el
candado del consultorio. La de afuera se conserva solo para fallar rápido.

**Nunca aceptes un `patientId` o `consultationId` de la interfaz sin comprobar
su consultorio.** Los server actions arman su entrada con
`Object.fromEntries(formData)`: esos ids los elige quien manda el formulario.
Filtrar al LEER no alcanza; hay que validar antes de ESCRIBIR, con los
ayudantes de `lib/services/tenant-guard.ts`.

Se reprodujeron con pruebas, todas desde un usuario normal con sesión válida:
escribir signos vitales en el paciente de otra clínica, registrar un
diagnóstico en su consulta, emitir una receta a nombre de su paciente, y
cerrarle una consulta en curso. No son fugas de lectura: son escrituras en
expedientes clínicos ajenos.

**Todo consecutivo por consultorio se genera con candado, dentro de una
transacción.** Folios de cita, receta y orden (`generateFolio`) y números de
expediente (`generateRecordNumber`), ambos en `lib/utils/folio.ts`. Un
`count() + 1` suelto hace que dos altas simultáneas obtengan el mismo número y
la segunda muera con llave duplicada, delante del usuario.

**Los servicios usan el singleton de `@/lib/db`.** Una prueba que instancie su
propio PrismaClient NO redirige a los servicios: seguirían escribiendo contra
`process.env.DATABASE_URL`. Por eso `tests/integration/setup.ts` reescribe esa
variable antes de que nadie importe `@/lib/db`. Quitarlo del config hace que
las pruebas escriban en PRODUCCIÓN.

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
- **Rotación de credenciales: DECIDIDO NO HACERLA** (30 ago 2026). Se planteó
  porque algunos secretos circularon por un chat en julio; el usuario evaluó el
  riesgo y decidió que no lo amerita, dado que viven en Railway. Es su decisión:
  no volver a proponerlo.
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

### Auditoría contra la matriz de procesos (2 sep 2026)

Se validaron ~40 de los 52 procesos de `Doctovio_Matriz_Validacion_Procesos.xlsx`.
**14 bugs encontrados y corregidos. Once eran lecturas o escrituras en
expedientes de otros consultorios**, todos reproducibles desde un usuario normal
con sesión válida:

| Servicio | Permitía |
|---|---|
| `recordVitalSigns` | escribir presión y glucosa en un paciente ajeno |
| `getLatestVitalSigns` | leer los signos vitales de un paciente ajeno |
| `createDiagnosis` | registrar un diagnóstico en la consulta ajena |
| `finalizeConsultation` | cerrar la consulta EN CURSO de otro médico |
| `issuePrescription` | emitir una receta a nombre de un paciente ajeno |
| `issueMedicalOrder` | lo mismo con órdenes médicas |
| `uploadPatientDocument` | colgar un documento del expediente equivocado |
| `createVisit` | abrir una visita con un paciente ajeno |
| `createPayment` | cobrar contra la consulta de otro consultorio |
| `startConsultation` | abrir consulta sobre la visita y el paciente ajenos |
| `buildSharedSnapshot` | **exfiltrar el resumen clínico ajeno por referencias** |

El último era el peor: la referencia médica está diseñada para compartir datos,
así que nada downstream lo habría marcado como anómalo.

Más los de concurrencia: doble reserva del mismo horario, folios duplicados y
números de expediente duplicados.

**Lectura del hallazgo:** el aislamiento de LECTURA estaba bien desde antes; el
de ESCRITURA no existía. Los servicios recibían `organizationId` y lo usaban
para crear la fila, pero no para validar los ids que venían del formulario.

**Lo que sigue sin cubrirse:** WhatsApp con número real, recordatorios,
Resend y Google Calendar — todos dependen de credenciales de terceros. Y API-01
(IDOR por HTTP), que sí se puede hacer.

**Recorridos para validación manual:** artefacto publicado el 2 sep 2026 con los
cinco caminos de usuario y qué mirar en cada paso.

---

### Lo siguiente, en orden

**1. 🔴 Quitar los usuarios demo de producción.** `admin@demo.com`,
`doctor@demo.com` y `asistente@demo.com` siguen vivos con `Demo1234!`, una
contraseña documentada en este archivo, y con acceso a los expedientes reales de
la Dra. Es lo último que queda antes de meter un consultorio de terceros.

**2. 🟡 API-01 · IDOR por HTTP.** Es la única familia de bug ya conocida que no
se ha probado por su propia puerta. Necesita un cliente HTTP con cookies
manipuladas; la base de pruebas ya existe.

**3. 🟡 Los recorridos manuales.** Lo que ninguna prueba puede ver: que la
pantalla llame al servicio correcto con los argumentos correctos.

**4. 🟡 Índices compuestos.** A 40 consultorios la agenda se va a sentir. Hoy
no duele: hay dos.

**5. 🟢 Diferible:** `ClinicUser` (un doctor en varios consultorios), RLS en
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

## Módulo dental (4 sep 2026)

Se habilita solo cuando `Organization.type = DENTAL`. **Aditivo de principio a
fin:** ninguna tabla existente cambió de forma —salvo una columna anulable en
`patient_documents`— y ningún servicio del core lee las tablas nuevas. Apagar el
módulo deja Doctovio exactamente como estaba.

**Las tres capas, cada una con UN dueño.** Es la decisión de la que cuelga todo
lo demás:

| Concepto | Dónde vive | Color |
|---|---|---|
| Hallazgo (lo que se encontró) | `OdontogramEntry` kind=FINDING | rojo |
| Tratamiento planeado (lo que se propone) | `TreatmentPlanItem` | ámbar |
| Tratamiento realizado (lo que se hizo) | `OdontogramEntry` kind=TREATMENT | verde |

Planear NO escribe en la bitácora del odontograma. Marcar "realizado" crea la
anotación y la deja ligada al renglón del plan (`resultEntryId`). Así el
diagrama sigue derivándose de una sola fuente y el plan no se vuelve una segunda
versión del expediente.

**ACEPTAR ≠ REALIZAR.** Aceptar una cotización mueve sus tratamientos de
`PENDING` a `ACCEPTED` y ahí se detiene. Pasarlos a `COMPLETED` exige
`MANAGE_DENTAL_TREATMENT` (ADMIN o DOCTOR) y es lo único que escribe en el
odontograma. Sin esta separación, un expediente terminaría diciendo que se hizo
una endodoncia que nadie hizo, solo porque alguien firmó un presupuesto.
Probado en `tests/integration/dental.test.ts`.

**Los precios se COPIAN, nunca se apuntan.** `TreatmentPlanItem` guarda
`listPrice` (catálogo al planear) y `unitPrice` (lo aplicado a ese paciente);
`QuoteItem` guarda además su propio nombre y descripción. Subirle el precio a
una resina no reescribe la COT-000145 que ya se le entregó a alguien. Es la
misma regla que ya regía `Product → Subscription → BillingCycle` en la cobranza
de la plataforma.

**`CatalogItem` ≠ `Product`.** `Product` es el catálogo de Doctovio: lo que el
consultorio le paga a la plataforma, y lo administra el Master. `CatalogItem` es
lo que el consultorio le cobra a SU paciente. Se evaluó meterle `organizationId`
a `Product` y se descartó: habría dejado las suscripciones de la plataforma
mezcladas con las resinas de un dentista, y el panel Master leyéndolas juntas.

**"Vencida" no se guarda, se DERIVA** de `validUntil` (`isExpired()` en
`quotes.ts`). Misma decisión que `cycleState()` en la cobranza, y por lo mismo:
guardarla obligaría a un proceso nocturno, y el día que fallara el sistema
mostraría vigente algo que ya no lo está. Por eso `QuoteStatus` no tiene
`EXPIRED`.

**El cuadrante 1 se dibuja a la IZQUIERDA de la pantalla** (es la derecha del
paciente), y la cara **mesial cambia de lado según el cuadrante**: es la que
mira a la línea media. Espejearla marca la caries en la cara contraria del
diente. `mesialSide()` en `lib/constants/odontograma.ts`, con pruebas.

**El color nunca va solo.** Cada capa lleva letra (H/P/R/—), la pieza ausente va
tachada y cada diente tiene su `aria-label` con el resumen en texto. Uno de cada
doce hombres no distingue el rojo del verde, y este diagrama se lee justo por
ahí.

**El PDF es la impresión del navegador**, igual que la receta: se reutilizó
`components/documents/letterhead.tsx` y `PrintButton`. No se agregó ninguna
librería de PDF. El envío por correo reutiliza Resend y manda el detalle en el
cuerpo, no adjunto — el servidor no genera archivos.

**Nada se borra.** Una anotación equivocada se CANCELA con motivo obligatorio y
queda visible tachada en la historia. Un producto usado en una cotización se
desactiva, no se elimina: borrarlo dejaría hueca una hoja ya entregada.

**Puertas de cada acción del módulo:** sesión → permiso del rol → `assertDentalClinic`
→ `assertPatientInClinic`. La tercera existe porque ocultar el enlace de la barra
lateral no protege una ruta: la dirección se escribe a mano.

### Pantallas

- `/patients/[id]/odontograma` — diagrama, plan, historial y cotizaciones, en
  pestañas. Ruta NUEVA: el expediente de siempre solo ganó una tarjeta de
  resumen, y únicamente en consultorios dentales.
- `/products` · `/products/nuevo` · `/products/[id]` — catálogo del consultorio.
- `/quotes/[id]` — la cotización como se emitió, con membrete y para imprimir.

Todo lo que se elige (pestaña, pieza, dentición, fecha) va en la URL, no en
`useState`: al guardar, `revalidatePath` remonta el árbol y con estado local el
dentista perdería la pieza abierta justo después de anotar en ella.

---

## Talla y peso en la receta (4 sep 2026)

La etiqueta se imprime SIEMPRE que la casilla esté encendida, haya dato o no:
sin valor queda la raya para llenarla a mano. Una etiqueta vacía se ve; una
ausente, no — y una receta sin peso no se puede dosificar en pediatría ni en
oncología.

Aplica a **cualquier giro de consultorio** y se apaga en Configuración → Receta
("Mostrar talla y peso"). Las plantillas ya guardadas no traen el campo, así que
`resolveTemplate` les pone `true` con el `??`; sin esa línea aparecerían
apagadas para todos los consultorios existentes.

**De dónde sale el dato** (`getMeasurementsForDocument` en `vitalSigns.ts`):

1. Si la receta salió de una consulta, mandan los signos de ESA consulta.
2. Lo que falte se completa con la medición previa más reciente, **nunca
   posterior a la fecha del documento**: reimprimir una receta de hace dos años
   con el peso de hoy sería falsear un registro clínico.
3. Cada campo se busca por separado. Una toma de seguimiento suele traer peso
   sin talla, y usar la fila completa dejaría en blanco una talla que sí está
   registrada meses atrás.

`VitalSign` no lleva `organizationId`: cuelga de la consulta, y el filtro va por
esa relación. Probado en `tests/integration/receta-medidas.test.ts`, incluido el
cruce entre consultorios.

La copia pública de la receta (`/public/receta/[token]`) muestra lo mismo: si
faltara ahí, serían dos documentos distintos con el mismo folio.

### 🔴 Orden del despliegue

**La migración `20260904160000_modulo_dental` va ANTES que el código.**
`listPatientDocuments` usa `include`, así que Prisma pide todas las columnas de
`patient_documents` —incluida `tooth_code`—: si el código sube sin la migración,
la sección de Documentos del expediente truena en TODOS los consultorios, no
solo en los dentales.

```powershell
npx prisma migrate deploy   # primero esto
git push                    # y luego el código
```

Pendientes de aplicar en producción: `20260904120000_odontograma` y
`20260904160000_modulo_dental`. Ambas ya están aplicadas en `doctovio_test`.

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
