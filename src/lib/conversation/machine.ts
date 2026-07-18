import { db } from "@/lib/db";
import {
  consultarDisponibilidad,
  crearReservaTemporal,
  liberarReservaTemporal,
  crearCita,
  consultarCita,
  reagendarCita,
  cancelarCita,
  confirmarAsistencia,
  SchedulingError,
} from "@/lib/services/scheduling";
import { INITIAL_STATE, type Step, type Ctx, type SessionState, type BotReply } from "./state";
import type { AppointmentType } from "@prisma/client";

/**
 * MÁQUINA CONVERSACIONAL del asistente de agenda.
 *
 * Determinista: cada mensaje del paciente entra con el estado guardado y sale
 * con una respuesta y un estado nuevo. No inventa nada — para actuar solo puede
 * llamar al motor de agenda (services/scheduling.ts).
 *
 * Reglas de conversación que respeta:
 *   · una pregunta por mensaje          · máximo cinco opciones
 *   · fechas completas, sin abreviaturas · confirmar antes de cada operación
 *   · siempre existe "Hablar con una persona"
 *   · un error nunca reinicia la conversación
 *   · nunca muestra datos clínicos
 *
 * Lo que NO hace: diagnosticar, interpretar síntomas, ni prometer una cita
 * que el motor no haya confirmado.
 */

// El estado vive en ./state para romper el ciclo de importaciones con
// scheduling. Se re-exporta para no cambiar quién ya lo importaba de aquí.
export { INITIAL_STATE } from "./state";
export type { Step, Ctx, SessionState, BotReply } from "./state";

export type MachineResult = {
  replies: BotReply[];
  state: SessionState;
  /** true = la conversación pasa a la bandeja del consultorio. */
  escalate?: boolean;
};

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

/**
 * LÍMITE DURO: WhatsApp corta el título de un botón a 20 caracteres y el de
 * una lista a 24. Si una opción se pasa, el paciente la toca, WhatsApp nos
 * devuelve el texto CORTADO y la máquina no lo reconoce — el bot no entiende
 * sus propios botones.
 *
 * Regla: ninguna etiqueta de opción debe pasar de 20 caracteres.
 */
const MAX_OPTION = 20;

const HUMAN_OPTION = "Hablar con alguien";

const fullDate = (d: Date) =>
  d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });

const fullTime = (d: Date) =>
  d.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit", hour12: true });

const dateKey = (d: Date) => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

/**
 * Marcas diacríticas (U+0300–U+036F). Se construye desde cadena a propósito:
 * escritos como literales son caracteres invisibles que cualquier editor rompe.
 */
const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

/** Detecta intención por palabras clave. Sin IA: solo atajos evidentes. */
function intentOf(text: string): "schedule" | "consult" | "reschedule" | "cancel" | "human" | "emergency" | null {
  // Quita acentos para que "reagendar" y "reagéndar" caigan igual.
  const t = text.toLowerCase().normalize("NFD").replace(DIACRITICS, "");

  if (/(dolor de pecho|no puedo respirar|sangrado|desmay|convuls|emergencia|urgencia)/.test(t)) return "emergency";
  if (/(agendar|nueva cita|quiero una cita|sacar cita|apartar)/.test(t)) return "schedule";
  if (/(cuando es mi cita|consultar|mi cita|a que hora)/.test(t)) return "consult";
  if (/(reagendar|cambiar|mover|otro dia|otro horario)/.test(t)) return "reschedule";
  if (/(cancelar|no podre|no voy|no puedo asistir)/.test(t)) return "cancel";
  if (/(persona|humano|recepcion|consultorio|asesor)/.test(t)) return "human";
  return null;
}

/**
 * El paciente puede responder con el número o con el texto de la opción.
 *
 * También acepta el texto CORTADO a 20 caracteres: es lo que devuelve WhatsApp
 * cuando el título de un botón excede su límite. Es una red de seguridad — las
 * etiquetas deberían caber— pero evita que el bot ignore su propio botón.
 */
function pick(input: string, options: string[]): number | null {
  const t = input.trim().toLowerCase();

  const n = Number(t.replace(/\D/g, ""));
  if (Number.isInteger(n) && n >= 1 && n <= options.length && /^\d+$/.test(t)) return n - 1;

  const exact = options.findIndex((o) => o.toLowerCase() === t);
  if (exact >= 0) return exact;

  return options.findIndex((o) => o.slice(0, MAX_OPTION).toLowerCase() === t);
}

// ---------------------------------------------------------------------------
// Pantallas
// ---------------------------------------------------------------------------

const MENU_OPTIONS = ["Agendar una cita", "Consultar mi cita", "Reagendar", "Cancelar", HUMAN_OPTION];

function menu(clinicName: string): BotReply {
  return {
    text: `Hola, soy el asistente virtual de ${clinicName}, operado por Doctovio. Puedo ayudarte con tu cita.\n\n¿Qué necesitas?`,
    options: MENU_OPTIONS,
  };
}

const TYPE_OPTIONS = ["Primera consulta", "Seguimiento", HUMAN_OPTION];
const TYPE_VALUES: AppointmentType[] = ["FIRST_TIME", "FOLLOW_UP"];

const DAY_OPTIONS = ["Hoy", "Mañana", "Esta semana", "Elegir otra fecha", HUMAN_OPTION];
const PERIOD_OPTIONS = ["Por la mañana", "Por la tarde", "Cualquier horario"];

const EMERGENCY_TEXT =
  "Este canal sirve para gestionar citas y no sustituye una valoración médica.\n\n" +
  "Si tienes síntomas graves o consideras que existe una emergencia, comunícate con los servicios de emergencia de tu localidad o acude a atención médica inmediata.\n\n" +
  "Voy a avisar al consultorio para que te contacten.";

const escalated = (state: SessionState, note: string): MachineResult => ({
  replies: [
    {
      text: "Voy a solicitar apoyo del consultorio para atenderte correctamente. Tu conversación fue enviada a recepción y te responderán en breve.",
    },
  ],
  state: { ...state, step: "HUMAN" },
  escalate: true,
});

// ---------------------------------------------------------------------------
// Búsqueda de horarios (compartida entre agendar y reagendar)
// ---------------------------------------------------------------------------

/** Convierte la opción de día elegida en una fecha concreta. */
function resolveDay(choice: number): string | null {
  const d = new Date();
  if (choice === 0) return dateKey(d); // hoy
  if (choice === 1) {
    d.setDate(d.getDate() + 1);
    return dateKey(d); // mañana
  }
  if (choice === 2) {
    d.setDate(d.getDate() + 2); // "esta semana": se busca desde pasado mañana
    return dateKey(d);
  }
  return null;
}

/** Ofrece hasta 4 horarios; si no hay, lo dice sin dejar al paciente atorado. */
async function offerSlots(
  organizationId: string,
  ctx: Ctx,
  nextStep: Step,
  state: SessionState
): Promise<MachineResult> {
  const slots = await consultarDisponibilidad(organizationId, {
    doctorId: ctx.doctorId!,
    dateStr: ctx.dateStr!,
    type: ctx.type ?? "FOLLOW_UP",
    preference: ctx.preference ?? "any",
    limit: 4,
  });

  const day = fullDate(new Date(`${ctx.dateStr}T12:00:00`));

  if (slots.length === 0) {
    return {
      replies: [
        {
          text: `No tengo horarios disponibles para el ${day}.\n\n¿Qué prefieres?`,
          options: ["Ver otro día", HUMAN_OPTION],
        },
      ],
      state: { step: nextStep === "SCHED_SLOT" ? "SCHED_DAY" : "RESCHED_DAY", ctx },
    };
  }

  const labels = slots.map((s) => fullTime(s.startAt));
  return {
    replies: [
      {
        text: `Estos son los horarios disponibles para el ${day}:`,
        options: [...labels, "Ver otro día"],
      },
    ],
    state: { step: nextStep, ctx: { ...ctx, slots: slots.map((s) => s.startAt.toISOString()) } },
  };
}

// ---------------------------------------------------------------------------
// Motor de la conversación
// ---------------------------------------------------------------------------

export async function handleMessage(
  organizationId: string,
  session: { phone: string; patientId?: string | null },
  state: SessionState,
  input: string
): Promise<MachineResult> {
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
  const clinicName = org?.name ?? "el consultorio";
  const text = input.trim();
  const ctx = { ...state.ctx };

  // Estas dos tienen prioridad sobre cualquier paso.
  const intent = intentOf(text);
  if (intent === "emergency") {
    return {
      replies: [{ text: EMERGENCY_TEXT }],
      state: { step: "HUMAN", ctx },
      escalate: true,
    };
  }
  if (intent === "human") return escalated({ step: state.step, ctx }, "El paciente pidió hablar con una persona");

  // Si ya está con una persona, el asistente no interrumpe.
  if (state.step === "HUMAN") {
    return { replies: [], state: { step: "HUMAN", ctx } };
  }

  // Identificamos al paciente por su teléfono (sin exponer datos clínicos).
  const digits = session.phone.replace(/\D/g, "").slice(-10);
  const patient =
    session.patientId
      ? await db.patient.findUnique({ where: { id: session.patientId } })
      : await db.patient.findFirst({
          where: { organizationId, status: { not: "ARCHIVED" }, phone: { contains: digits } },
        });
  if (patient) {
    ctx.patientId = patient.id;
    ctx.patientName = `${patient.firstName} ${patient.lastLastName}`;
  }

  try {
    switch (state.step) {
      // ---------------------------------------------------------------- MENU
      case "MENU": {
        /*
          "Confirmar asistencia" llega desde el botón de un RECORDATORIO, no
          del menú. Se atiende aquí porque el recordatorio lo iniciamos
          nosotros: el paciente no venía navegando, le llegó un mensaje y
          respondió. Sin este caso, tocar el botón caería en "no entendí".
        */
        if (pick(text, ["Confirmar asistencia"]) === 0) {
          const appt = await consultarCita(organizationId, { whatsappPhone: session.phone });
          if (!appt) {
            return {
              replies: [{ text: "No encontré una cita próxima con este número.", options: MENU_OPTIONS }],
              state: { step: "MENU", ctx },
            };
          }
          await confirmarAsistencia(organizationId, appt.doctorId, {
            appointmentId: appt.id,
            by: "PATIENT",
          });
          return {
            replies: [
              {
                text:
                  `Gracias, tu asistencia quedó confirmada.\n\n` +
                  `${fullDate(appt.startTime)} a las ${fullTime(appt.startTime)}\n` +
                  `${appt.doctor.fullName}\n\nTe esperamos.`,
              },
            ],
            state: { step: "MENU", ctx: { ...ctx, appointmentId: appt.id } },
          };
        }

        const choice = pick(text, MENU_OPTIONS) ?? menuFromIntent(intent);
        if (choice === null) return { replies: [menu(clinicName)], state: { step: "MENU", ctx } };

        if (choice === 4) return escalated({ step: "MENU", ctx }, "Solicitud del paciente");

        if (choice === 0) {
          // Se avisa AQUÍ, no al final: hacerlo elegir día y horario para
          // rechazarlo al confirmar es una falta de respeto a su tiempo.
          if (!ctx.patientId) {
            return {
              replies: [
                {
                  text:
                    "Para agendar necesito tu expediente, y este número no está registrado con nosotros.\n\n" +
                    "Voy a pedirle al consultorio que te contacte para darte de alta. También puedes llamarnos directamente.",
                },
              ],
              state: { step: "HUMAN", ctx },
              escalate: true,
            };
          }

          // Agendar: elegir médico se omite cuando hay uno solo.
          const doctors = await db.user.findMany({
            where: { organizationId, primaryRole: "DOCTOR", isActive: true },
            select: { id: true },
          });
          if (doctors.length === 0) return escalated({ step: "MENU", ctx }, "No hay médicos configurados");
          ctx.doctorId = doctors[0].id;

          return {
            replies: [{ text: "¿Qué tipo de consulta necesitas?", options: TYPE_OPTIONS }],
            state: { step: "SCHED_TYPE", ctx },
          };
        }

        if (choice === 1) {
          const appt = await consultarCita(organizationId, { whatsappPhone: session.phone });
          if (!appt) {
            return {
              replies: [
                {
                  text: "No pude localizar una cita próxima con este número.\n\n¿Deseas agendar una?",
                  options: ["Agendar una cita", HUMAN_OPTION],
                },
              ],
              state: { step: "MENU", ctx },
            };
          }
          return {
            replies: [
              {
                text:
                  `Esta es tu cita:\n\n` +
                  `${fullDate(appt.startTime)} a las ${fullTime(appt.startTime)}\n` +
                  `${appt.doctor.fullName}\n` +
                  `Folio: ${appt.folio ?? "—"}\n\n` +
                  `¿Necesitas algo más?`,
                options: MENU_OPTIONS,
              },
            ],
            state: { step: "MENU", ctx: { ...ctx, appointmentId: appt.id } },
          };
        }

        // Reagendar (2) o Cancelar (3): ambos empiezan localizando la cita.
        const appt = await consultarCita(organizationId, { whatsappPhone: session.phone });
        if (!appt) {
          return {
            replies: [
              {
                text: "No pude localizar tu cita con este número. Puedes escribir el folio de tu cita o solicitar ayuda del consultorio.",
                options: [HUMAN_OPTION],
              },
            ],
            state: { step: choice === 2 ? "RESCHED_FIND" : "MENU", ctx },
          };
        }
        ctx.appointmentId = appt.id;
        ctx.doctorId = appt.doctorId;
        ctx.type = appt.type;

        if (choice === 2) {
          return {
            replies: [
              {
                text: `Encontré esta cita:\n\n${fullDate(appt.startTime)} a las ${fullTime(appt.startTime)}\n${appt.doctor.fullName}\n\n¿Deseas cambiarla?`,
                options,
              },
            ],
            state: { step: "RESCHED_FIND", ctx },
          };
        }

        return {
          replies: [
            {
              text: `Encontré tu cita del ${fullDate(appt.startTime)} a las ${fullTime(appt.startTime)}.\n\n¿Deseas cancelarla?`,
              options: ["Sí, cancelar", "No, conservar cita", "Prefiero reagendar", HUMAN_OPTION],
            },
          ],
          state: { step: "CANCEL_CONFIRM", ctx },
        };
      }

      // ----------------------------------------------------------- AGENDAR
      case "SCHED_TYPE": {
        const choice = pick(text, TYPE_OPTIONS);
        if (choice === null)
          return {
            replies: [{ text: "¿Qué tipo de consulta necesitas?", options: TYPE_OPTIONS }],
            state,
          };
        if (choice === 2) return escalated(state, "Solicitud del paciente");

        ctx.type = TYPE_VALUES[choice];
        return {
          replies: [{ text: "¿Qué día prefieres?", options: DAY_OPTIONS }],
          state: { step: "SCHED_DAY", ctx },
        };
      }

      case "SCHED_DAY": {
        const choice = pick(text, DAY_OPTIONS) ?? (pick(text, ["Ver otro día"]) === 0 ? 3 : null);
        if (choice === null) return { replies: [{ text: "¿Qué día prefieres?", options: DAY_OPTIONS }], state };
        if (choice === 4) return escalated(state, "Solicitud del paciente");
        if (choice === 3) {
          return {
            replies: [{ text: "Escribe la fecha que prefieres con este formato: día/mes/año. Por ejemplo: 23/07/2026." }],
            state: { step: "SCHED_DATE_INPUT", ctx },
          };
        }

        ctx.dateStr = resolveDay(choice)!;
        return {
          replies: [{ text: "¿Qué horario prefieres?", options: PERIOD_OPTIONS }],
          state: { step: "SCHED_PERIOD", ctx },
        };
      }

      case "SCHED_DATE_INPUT": {
        const parsed = parseDate(text);
        if (!parsed) {
          return {
            replies: [{ text: "No entendí la fecha. Escríbela como día/mes/año. Por ejemplo: 23/07/2026." }],
            state,
          };
        }
        ctx.dateStr = parsed;
        return {
          replies: [{ text: "¿Qué horario prefieres?", options: PERIOD_OPTIONS }],
          state: { step: "SCHED_PERIOD", ctx },
        };
      }

      case "SCHED_PERIOD": {
        const choice = pick(text, PERIOD_OPTIONS);
        if (choice === null)
          return { replies: [{ text: "¿Qué horario prefieres?", options: PERIOD_OPTIONS }], state };
        ctx.preference = (["morning", "afternoon", "any"] as const)[choice];
        return offerSlots(organizationId, ctx, "SCHED_SLOT", state);
      }

      case "SCHED_SLOT": {
        const labels = (ctx.slots ?? []).map((s) => fullTime(new Date(s)));
        const options = [...labels, "Ver otro día"];
        const choice = pick(text, options);
        if (choice === null) return { replies: [{ text: "Elige uno de los horarios:", options }], state };
        if (choice === labels.length) {
          return { replies: [{ text: "¿Qué día prefieres?", options: DAY_OPTIONS }], state: { step: "SCHED_DAY", ctx } };
        }

        // Se aparta el horario mientras confirma, para que nadie más lo tome.
        const startAt = new Date(ctx.slots![choice]);
        const hold = await crearReservaTemporal(organizationId, {
          doctorId: ctx.doctorId!,
          startAt,
          type: ctx.type ?? "FOLLOW_UP",
          patientId: ctx.patientId,
          sessionKey: session.phone,
        });
        ctx.holdId = hold.id;
        ctx.slots = [startAt.toISOString()];

        const doctor = await db.user.findUnique({ where: { id: ctx.doctorId! }, select: { fullName: true } });
        return {
          replies: [
            {
              text:
                `Confirma los datos:\n\n` +
                `Paciente: ${ctx.patientName ?? "por registrar"}\n` +
                `Médico: ${doctor?.fullName ?? ""}\n` +
                `Fecha: ${fullDate(startAt)}\n` +
                `Hora: ${fullTime(startAt)}\n` +
                `Modalidad: presencial\n\n` +
                `¿Deseas confirmar?`,
              options: ["Confirmar cita", "Cambiar horario", "Cancelar proceso"],
            },
          ],
          state: { step: "SCHED_CONFIRM", ctx },
        };
      }

      case "SCHED_CONFIRM": {
        const options = ["Confirmar cita", "Cambiar horario", "Cancelar proceso"];
        const choice = pick(text, options);
        if (choice === null) return { replies: [{ text: "¿Deseas confirmar la cita?", options }], state };

        if (choice === 1) {
          if (ctx.holdId) await liberarReservaTemporal(ctx.holdId);
          ctx.holdId = undefined;
          return { replies: [{ text: "¿Qué día prefieres?", options: DAY_OPTIONS }], state: { step: "SCHED_DAY", ctx } };
        }
        if (choice === 2) {
          if (ctx.holdId) await liberarReservaTemporal(ctx.holdId);
          return { replies: [menu(clinicName)], state: { step: "MENU", ctx: { patientId: ctx.patientId, patientName: ctx.patientName } } };
        }

        // Sin expediente no se puede crear la cita: lo ve una persona.
        if (!ctx.patientId) {
          if (ctx.holdId) await liberarReservaTemporal(ctx.holdId);
          return escalated(state, "Paciente sin expediente: requiere registro");
        }

        // El actor de la bitácora debe ser un usuario del sistema; el origen
        // real queda registrado en channel: WHATSAPP.
        const startAt = new Date(ctx.slots![0]);
        const appt = await crearCita(organizationId, ctx.doctorId!, {
          patientId: ctx.patientId,
          doctorId: ctx.doctorId!,
          startAt,
          type: ctx.type ?? "FOLLOW_UP",
          channel: "WHATSAPP",
          whatsappPhone: session.phone,
          holdId: ctx.holdId,
        });

        const doctor = await db.user.findUnique({ where: { id: ctx.doctorId! }, select: { fullName: true } });
        return {
          replies: [
            {
              text:
                `Tu cita quedó confirmada.\n\n` +
                `${doctor?.fullName ?? ""}\n` +
                `${fullDate(startAt)} a las ${fullTime(startAt)}\n` +
                `Folio: ${appt.folio}\n\n` +
                `Te enviaremos un recordatorio antes de tu consulta.`,
            },
          ],
          state: { step: "MENU", ctx: { patientId: ctx.patientId, patientName: ctx.patientName } },
        };
      }

      // --------------------------------------------------------- REAGENDAR
      case "RESCHED_FIND": {
        const options = ["Sí, cambiarla", "No, dejarla igual", HUMAN_OPTION];
        const choice = pick(text, options);
        if (choice === null) {
          // Puede haber escrito el folio.
          const byFolio = await consultarCita(organizationId, { folio: text });
          if (byFolio) {
            ctx.appointmentId = byFolio.id;
            ctx.doctorId = byFolio.doctorId;
            ctx.type = byFolio.type;
            return {
              replies: [
                {
                  text: `Encontré esta cita:\n\n${fullDate(byFolio.startTime)} a las ${fullTime(byFolio.startTime)}\n\n¿Deseas cambiarla?`,
                  options,
                },
              ],
              state: { step: "RESCHED_FIND", ctx },
            };
          }
          return { replies: [{ text: "¿Deseas cambiar tu cita?", options }], state };
        }
        if (choice === 2) return escalated(state, "Solicitud del paciente");
        if (choice === 1) return { replies: [menu(clinicName)], state: { step: "MENU", ctx } };

        return { replies: [{ text: "¿Qué día prefieres?", options: DAY_OPTIONS }], state: { step: "RESCHED_DAY", ctx } };
      }

      case "RESCHED_DAY": {
        const choice = pick(text, DAY_OPTIONS) ?? (pick(text, ["Ver otro día"]) === 0 ? 3 : null);
        if (choice === null) return { replies: [{ text: "¿Qué día prefieres?", options: DAY_OPTIONS }], state };
        if (choice === 4) return escalated(state, "Solicitud del paciente");
        if (choice === 3) {
          return {
            replies: [{ text: "Escribe la fecha que prefieres con este formato: día/mes/año. Por ejemplo: 23/07/2026." }],
            state: { step: "RESCHED_DATE_INPUT", ctx },
          };
        }
        ctx.dateStr = resolveDay(choice)!;
        ctx.preference = "any";
        return offerSlots(organizationId, ctx, "RESCHED_SLOT", state);
      }

      case "RESCHED_DATE_INPUT": {
        const parsed = parseDate(text);
        if (!parsed)
          return {
            replies: [{ text: "No entendí la fecha. Escríbela como día/mes/año. Por ejemplo: 23/07/2026." }],
            state,
          };
        ctx.dateStr = parsed;
        ctx.preference = "any";
        return offerSlots(organizationId, ctx, "RESCHED_SLOT", state);
      }

      case "RESCHED_SLOT": {
        const labels = (ctx.slots ?? []).map((s) => fullTime(new Date(s)));
        const options = [...labels, "Ver otro día"];
        const choice = pick(text, options);
        if (choice === null) return { replies: [{ text: "Elige uno de los horarios:", options }], state };
        if (choice === labels.length)
          return { replies: [{ text: "¿Qué día prefieres?", options: DAY_OPTIONS }], state: { step: "RESCHED_DAY", ctx } };

        const startAt = new Date(ctx.slots![choice]);
        const hold = await crearReservaTemporal(organizationId, {
          doctorId: ctx.doctorId!,
          startAt,
          type: ctx.type ?? "FOLLOW_UP",
          patientId: ctx.patientId,
          sessionKey: session.phone,
        });
        ctx.holdId = hold.id;
        ctx.slots = [startAt.toISOString()];

        const current = await db.appointment.findUnique({ where: { id: ctx.appointmentId! } });
        return {
          replies: [
            {
              text:
                `Cambiaremos tu cita:\n\n` +
                `Anterior: ${fullDate(current!.startTime)} a las ${fullTime(current!.startTime)}\n` +
                `Nueva: ${fullDate(startAt)} a las ${fullTime(startAt)}\n\n` +
                `¿Confirmas el cambio?`,
              options: ["Confirmar cambio", "Ver otro horario", "Cancelar proceso"],
            },
          ],
          state: { step: "RESCHED_CONFIRM", ctx },
        };
      }

      case "RESCHED_CONFIRM": {
        const options = ["Confirmar cambio", "Ver otro horario", "Cancelar proceso"];
        const choice = pick(text, options);
        if (choice === null) return { replies: [{ text: "¿Confirmas el cambio?", options }], state };

        if (choice === 1) {
          if (ctx.holdId) await liberarReservaTemporal(ctx.holdId);
          ctx.holdId = undefined;
          return { replies: [{ text: "¿Qué día prefieres?", options: DAY_OPTIONS }], state: { step: "RESCHED_DAY", ctx } };
        }
        if (choice === 2) {
          if (ctx.holdId) await liberarReservaTemporal(ctx.holdId);
          return { replies: [menu(clinicName)], state: { step: "MENU", ctx: { patientId: ctx.patientId, patientName: ctx.patientName } } };
        }

        const startAt = new Date(ctx.slots![0]);
        await reagendarCita(organizationId, ctx.doctorId!, {
          appointmentId: ctx.appointmentId!,
          newStartAt: startAt,
          holdId: ctx.holdId,
          reason: "Reagendada por el paciente vía WhatsApp",
        });

        return {
          replies: [
            {
              text: `Listo, tu cita quedó reagendada.\n\n${fullDate(startAt)} a las ${fullTime(startAt)}\n\nTe enviaremos un recordatorio antes de tu consulta.`,
            },
          ],
          state: { step: "MENU", ctx: { patientId: ctx.patientId, patientName: ctx.patientName } },
        };
      }

      // ----------------------------------------------------------- CANCELAR
      case "CANCEL_CONFIRM": {
        const options = ["Sí, cancelar", "No, conservar cita", "Prefiero reagendar", HUMAN_OPTION];
        const choice = pick(text, options);
        if (choice === null) return { replies: [{ text: "¿Deseas cancelar tu cita?", options }], state };
        if (choice === 3) return escalated(state, "Solicitud del paciente");
        if (choice === 1) return { replies: [menu(clinicName)], state: { step: "MENU", ctx } };
        if (choice === 2)
          return { replies: [{ text: "¿Qué día prefieres?", options: DAY_OPTIONS }], state: { step: "RESCHED_DAY", ctx } };

        return {
          replies: [
            {
              text: "Para ayudarnos a mejorar, ¿cuál es el motivo?",
              options: ["Ya no la necesito", "Cambié de horario", "Problema personal", "Prefiero no decir"],
            },
          ],
          state: { step: "CANCEL_REASON", ctx },
        };
      }

      case "CANCEL_REASON": {
        const options = ["Ya no la necesito", "Cambié de horario", "Problema personal", "Prefiero no decir"];
        const choice = pick(text, options);
        const reason = choice === null ? text.slice(0, 200) : choice === 3 ? undefined : options[choice];

        await cancelarCita(organizationId, ctx.doctorId!, {
          appointmentId: ctx.appointmentId!,
          reason,
          enforceWindow: true,
        });

        return {
          replies: [
            {
              text: "Tu cita quedó cancelada. Si más adelante deseas agendar de nuevo, aquí estoy.",
              options: MENU_OPTIONS,
            },
          ],
          state: { step: "MENU", ctx: { patientId: ctx.patientId, patientName: ctx.patientName } },
        };
      }

      default:
        return { replies: [menu(clinicName)], state: INITIAL_STATE };
    }
  } catch (e) {
    // Los errores de negocio se explican en palabras del paciente; el resto
    // nunca se muestra crudo: se escala. Jamás se reinicia la conversación.
    if (e instanceof SchedulingError) {
      if (e.code === "TAKEN") {
        return {
          replies: [{ text: `${e.message}\n\nTe muestro otras opciones disponibles.` }],
          state: { step: state.step === "RESCHED_CONFIRM" ? "RESCHED_DAY" : "SCHED_DAY", ctx },
        };
      }
      if (e.code === "CANCEL_TOO_LATE") {
        return { replies: [{ text: e.message }], state: { step: "HUMAN", ctx }, escalate: true };
      }
      return {
        replies: [{ text: `${e.message}\n\n¿Qué día prefieres?`, options: DAY_OPTIONS }],
        state: { step: state.step.startsWith("RESCHED") ? "RESCHED_DAY" : "SCHED_DAY", ctx },
      };
    }
    return escalated({ step: state.step, ctx }, "Error inesperado del sistema");
  }
}

/** Del menú principal cuando el paciente escribió en lugar de elegir. */
function menuFromIntent(intent: ReturnType<typeof intentOf>): number | null {
  if (intent === "schedule") return 0;
  if (intent === "consult") return 1;
  if (intent === "reschedule") return 2;
  if (intent === "cancel") return 3;
  return null;
}

/** Acepta 23/07/2026 y 23-07-2026. Valida que sea una fecha real. */
function parseDate(text: string): string | null {
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text.trim());
  if (!m) return null;
  const [, d, mo, y] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  if (date.getMonth() !== Number(mo) - 1) return null; // 31/02 y similares
  return dateKey(date);
}
