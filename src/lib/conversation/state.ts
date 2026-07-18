import type { AppointmentType } from "@prisma/client";

/**
 * Estado de la conversación. Vive aparte de la máquina, SIN importar nada más
 * que tipos, para romper el ciclo de importaciones:
 *
 *   scheduling → reminders → orchestrator → machine → scheduling
 *
 * Ese ciclo dejaba módulos a medio inicializar al arrancar. Los recordatorios
 * y el orquestador solo necesitan el estado inicial, no la máquina entera.
 */
export type Step =
  | "MENU"
  | "SCHED_TYPE"
  | "SCHED_DAY"
  | "SCHED_DATE_INPUT"
  | "SCHED_PERIOD"
  | "SCHED_SLOT"
  | "SCHED_CONFIRM"
  | "RESCHED_FIND"
  | "RESCHED_DAY"
  | "RESCHED_DATE_INPUT"
  | "RESCHED_SLOT"
  | "RESCHED_CONFIRM"
  | "CANCEL_CONFIRM"
  | "CANCEL_REASON"
  | "HUMAN";

export type Ctx = {
  patientId?: string;
  patientName?: string;
  doctorId?: string;
  type?: AppointmentType;
  dateStr?: string;
  preference?: "morning" | "afternoon" | "any";
  /** Horarios ofrecidos, en ISO. Se re-validan al confirmar. */
  slots?: string[];
  holdId?: string;
  appointmentId?: string;
};

export type SessionState = { step: Step; ctx: Ctx };

export type BotReply = { text: string; options?: string[] };

export const INITIAL_STATE: SessionState = { step: "MENU", ctx: {} };
