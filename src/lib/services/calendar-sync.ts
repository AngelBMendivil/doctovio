import { db } from "@/lib/db";
import { createEvent, updateEvent, deleteEvent, listEvents, GoogleCalendarError } from "@/lib/google/calendar";
import { GoogleAuthError } from "@/lib/google/oauth";

/**
 * SINCRONIZACIÓN CON GOOGLE CALENDAR.
 *
 * Regla única: **Doctovio es la fuente de verdad**. Google es un reflejo.
 *
 *   Doctovio → Google   las citas se publican como eventos
 *   Google → Doctovio   los eventos PERSONALES del médico solo BLOQUEAN
 *                       disponibilidad; jamás se convierten en citas
 *
 * Un fallo de Google nunca debe tumbar una operación de agenda: la cita ya
 * existe en Doctovio y eso es lo que importa. Si Google no responde, la cita
 * queda marcada como pendiente de sincronizar y se reintenta después.
 */

const MARK = "doctovioAppointmentId";

async function connectionFor(doctorId: string) {
  return db.googleCalendarConnection.findUnique({ where: { doctorId } });
}

/** Texto del evento. NUNCA lleva datos clínicos: el calendario no es el expediente. */
function eventText(patientName: string, folio: string | null, reason: string | null) {
  return {
    summary: `Consulta — ${patientName}`,
    description: [folio ? `Folio: ${folio}` : "", reason ? `Motivo: ${reason}` : "", "Agendado en Doctovio"]
      .filter(Boolean)
      .join("\n"),
  };
}

/**
 * Publica (o actualiza) una cita en Google.
 *
 * Es idempotente: si la cita ya tiene evento, lo actualiza en vez de crear
 * otro. Eso evita el clásico duplicado al reintentar tras un error de red.
 */
export async function pushAppointment(appointmentId: string): Promise<void> {
  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    include: { patient: true, doctor: true, organization: { include: { settings: true } } },
  });
  if (!appt) return;

  const conn = await connectionFor(appt.doctorId);
  if (!conn || !conn.pushEvents) return; // el médico no conectó o no quiere publicar

  const timeZone = appt.organization.settings?.timezone ?? "America/Mexico_City";
  const patientName = `${appt.patient.firstName} ${appt.patient.lastLastName}`;
  const { summary, description } = eventText(patientName, appt.folio, appt.reason);
  const endAt = new Date(appt.startTime.getTime() + appt.durationMinutes * 60_000);

  await db.appointment.update({ where: { id: appt.id }, data: { syncStatus: "IN_PROGRESS" } });

  try {
    const cancelled = appt.status === "CANCELLED" || !appt.isActive;

    if (cancelled) {
      if (appt.googleEventId) await deleteEvent(appt.doctorId, conn.calendarId, appt.googleEventId);
      await db.appointment.update({
        where: { id: appt.id },
        data: { googleEventId: null, syncStatus: "SYNCED", syncError: null, lastSyncedAt: new Date() },
      });
      return;
    }

    if (appt.googleEventId) {
      await updateEvent(appt.doctorId, conn.calendarId, appt.googleEventId, {
        summary,
        description,
        startAt: appt.startTime,
        endAt,
        timeZone,
      });
    } else {
      const created = await createEvent(appt.doctorId, conn.calendarId, {
        appointmentId: appt.id,
        summary,
        description,
        startAt: appt.startTime,
        endAt,
        timeZone,
      });
      await db.appointment.update({
        where: { id: appt.id },
        data: { googleEventId: created.id, googleCalendarId: conn.calendarId },
      });
    }

    await db.appointment.update({
      where: { id: appt.id },
      data: { syncStatus: "SYNCED", syncError: null, lastSyncedAt: new Date() },
    });
    await db.googleCalendarConnection.update({
      where: { doctorId: appt.doctorId },
      data: { lastSyncedAt: new Date(), lastError: null },
    });
  } catch (e) {
    const retryable = (e instanceof GoogleCalendarError || e instanceof GoogleAuthError) && e.retryable;
    await db.appointment.update({
      where: { id: appt.id },
      data: {
        syncStatus: retryable ? "TEMP_ERROR" : "PERMANENT_ERROR",
        syncError: e instanceof Error ? e.message.slice(0, 500) : "Error desconocido",
      },
    });
    // No se relanza: la cita existe en Doctovio y eso es lo que vale. El
    // sincronizador la recogerá después.
    console.error("[google] fallo al sincronizar cita", appt.id, e instanceof Error ? e.message : e);
  }
}

/**
 * Procesa la cola de citas pendientes de sincronizar.
 *
 * Lo llama el endpoint de mantenimiento. Se limita el lote a propósito: Google
 * tiene cuotas por proyecto y usuario, y quemarlas deja al consultorio sin
 * sincronización por el resto del día.
 */
export async function processSyncQueue(organizationId: string, limit = 25): Promise<{ processed: number }> {
  const pending = await db.appointment.findMany({
    where: { organizationId, syncStatus: { in: ["PENDING", "TEMP_ERROR"] } },
    select: { id: true },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });

  for (const a of pending) await pushAppointment(a.id);
  return { processed: pending.length };
}

/**
 * Trae los eventos personales del médico y los convierte en BLOQUEOS.
 *
 * Lo delicado está en la marca: los eventos que nosotros publicamos traen
 * `doctovioAppointmentId` y se ignoran. Sin ese filtro, cada cita publicada
 * regresaría como bloqueo y el médico se quedaría sin horarios libres por
 * culpa de sus propias citas.
 */
export async function pullBusyBlocks(doctorId: string, days = 30): Promise<{ blocks: number }> {
  const conn = await connectionFor(doctorId);
  if (!conn || !conn.pullBusy) return { blocks: 0 };

  const from = new Date();
  const to = new Date(Date.now() + days * 24 * 3600_000);

  const events = await listEvents(doctorId, conn.calendarId, from, to);

  const external = events.filter((e) => {
    if (e.status === "cancelled") return false;
    if (e.extendedProperties?.private?.[MARK]) return false; // es nuestro
    if (!e.start?.dateTime || !e.end?.dateTime) return false; // eventos de día completo: se ignoran
    return true;
  });

  // Se reemplazan los bloqueos traídos de Google en esa ventana: es más simple
  // y correcto que intentar conciliar uno por uno.
  await db.scheduleBlock.deleteMany({
    where: { doctorId, kind: "EXTERNAL_CALENDAR", startAt: { gte: from, lte: to } },
  });

  if (external.length > 0) {
    await db.scheduleBlock.createMany({
      data: external.map((e) => ({
        organizationId: conn.organizationId,
        doctorId,
        startAt: new Date(e.start!.dateTime!),
        endAt: new Date(e.end!.dateTime!),
        kind: "EXTERNAL_CALENDAR" as const,
        // El título del evento personal NO se guarda: es información privada
        // del médico y el motor solo necesita saber que está ocupado.
        reason: "Ocupado (Google Calendar)",
        googleEventId: e.id,
      })),
    });
  }

  await db.googleCalendarConnection.update({
    where: { doctorId },
    data: { lastSyncedAt: new Date(), lastError: null },
  });

  return { blocks: external.length };
}

/** Sincroniza en ambos sentidos a todos los médicos con calendario conectado. */
export async function syncAll(organizationId: string): Promise<{ pushed: number; doctors: number }> {
  const { processed } = await processSyncQueue(organizationId);

  const connections = await db.googleCalendarConnection.findMany({
    where: { organizationId, pullBusy: true },
    select: { doctorId: true },
  });

  for (const c of connections) {
    try {
      await pullBusyBlocks(c.doctorId);
    } catch (e) {
      console.error("[google] fallo al traer ocupación de", c.doctorId, e instanceof Error ? e.message : e);
    }
  }

  return { pushed: processed, doctors: connections.length };
}
