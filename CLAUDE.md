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
- **No es multiconsultorio.** `resolveOrganization` en el webhook hace
  `findFirst`. Es una app de un consultorio con forma de SaaS.
- **Un paciente nuevo no puede agendar por WhatsApp** — escala a recepción.
- **Verificación de negocio en Meta** pendiente: sin ella no hay número real.
- **Credenciales por rotar:** token de WhatsApp, App Secret y contraseña de la
  base circularon por un chat.
- Los expedientes creados antes del arreglo de `birthDate` tienen edad 0.

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
