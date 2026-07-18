import { getAccessToken } from "./oauth";

/**
 * Cliente de Google Calendar (REST directo, sin librería).
 *
 * Solo expone lo que Doctovio necesita: crear, mover, cancelar y consultar
 * ocupación. Nada de listar ni borrar calendarios.
 */

const API = "https://www.googleapis.com/calendar/v3";

export class GoogleCalendarError extends Error {
  constructor(
    message: string,
    public status: number,
    /** 429 y 5xx son temporales: reintentar con espera sí ayuda. */
    public retryable: boolean
  ) {
    super(message);
    this.name = "GoogleCalendarError";
  }
}

async function call<T>(doctorId: string, path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken(doctorId);

  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  // 204 (delete) no trae cuerpo.
  if (res.status === 204) return undefined as T;

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = (json as { error?: { message?: string } }).error;
    throw new GoogleCalendarError(
      err?.message || `Error ${res.status} de Google Calendar`,
      res.status,
      res.status === 429 || res.status >= 500
    );
  }

  return json as T;
}

export type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
};

/**
 * Crea el evento de una cita.
 *
 * `extendedProperties.private.doctovioAppointmentId` es la marca que permite
 * reconocer nuestros propios eventos al leer el calendario de vuelta: sin ella
 * las citas que publicamos regresarían como "bloqueos" y el médico se quedaría
 * sin disponibilidad por culpa de sus propias citas.
 */
export async function createEvent(
  doctorId: string,
  calendarId: string,
  event: {
    appointmentId: string;
    summary: string;
    description: string;
    startAt: Date;
    endAt: Date;
    timeZone: string;
    location?: string;
  }
): Promise<GoogleEvent> {
  return call<GoogleEvent>(doctorId, `/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    body: JSON.stringify({
      summary: event.summary,
      description: event.description,
      location: event.location,
      start: { dateTime: event.startAt.toISOString(), timeZone: event.timeZone },
      end: { dateTime: event.endAt.toISOString(), timeZone: event.timeZone },
      extendedProperties: { private: { doctovioAppointmentId: event.appointmentId } },
    }),
  });
}

export async function updateEvent(
  doctorId: string,
  calendarId: string,
  eventId: string,
  patch: { summary?: string; description?: string; startAt?: Date; endAt?: Date; timeZone?: string }
): Promise<GoogleEvent> {
  const body: Record<string, unknown> = {};
  if (patch.summary) body.summary = patch.summary;
  if (patch.description) body.description = patch.description;
  if (patch.startAt) body.start = { dateTime: patch.startAt.toISOString(), timeZone: patch.timeZone };
  if (patch.endAt) body.end = { dateTime: patch.endAt.toISOString(), timeZone: patch.timeZone };

  return call<GoogleEvent>(
    doctorId,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "PATCH", body: JSON.stringify(body) }
  );
}

/**
 * Cancela el evento. Un 404 o 410 significa que ya no está en Google —
 * exactamente lo que queríamos— así que no es error.
 */
export async function deleteEvent(doctorId: string, calendarId: string, eventId: string): Promise<void> {
  try {
    await call<void>(
      doctorId,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: "DELETE" }
    );
  } catch (e) {
    if (e instanceof GoogleCalendarError && (e.status === 404 || e.status === 410)) return;
    throw e;
  }
}

/**
 * Eventos del médico en una ventana. Se usa para bloquear disponibilidad con
 * su agenda personal.
 */
export async function listEvents(
  doctorId: string,
  calendarId: string,
  from: Date,
  to: Date
): Promise<GoogleEvent[]> {
  const params = new URLSearchParams({
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
    singleEvents: "true", // expande las series recurrentes
    orderBy: "startTime",
    maxResults: "250",
  });

  const json = await call<{ items?: GoogleEvent[] }>(
    doctorId,
    `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`
  );
  return json.items ?? [];
}
