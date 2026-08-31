"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { assertPermission } from "@/lib/auth/rbac";
import { db } from "@/lib/db";

/** Para que los mensajes de error digan de qué día hablan. */
const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export type ActionState = { ok: boolean; message: string } | null;

const toMinutes = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
};

/**
 * Guarda el horario laboral del médico. Reemplaza el horario completo en una
 * transacción: es más simple y evita filas huérfanas.
 */
export async function saveDoctorScheduleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    assertPermission(session.role, "MANAGE_USERS");

    const doctorId = String(formData.get("doctorId") || "");
    if (!doctorId) return { ok: false, message: "Falta el médico." };

    const doctor = await db.user.findFirst({
      where: { id: doctorId, organizationId: session.organizationId, primaryRole: "DOCTOR" },
    });
    if (!doctor) return { ok: false, message: "El médico no existe en esta organización." };

    const rows: { weekday: number; startMinute: number; endMinute: number }[] = [];

    for (let weekday = 0; weekday <= 6; weekday++) {
      if (formData.get(`active_${weekday}`) !== "on") continue;

      const dia = DAYS[weekday];

      const start = toMinutes(String(formData.get(`start_${weekday}`) || ""));
      const end = toMinutes(String(formData.get(`end_${weekday}`) || ""));
      if (start === null || end === null) {
        return { ok: false, message: "Revisa los horarios: usa el formato de 24 horas, por ejemplo 09:00." };
      }
      if (end <= start) {
        return { ok: false, message: `${dia}: la hora de salida debe ser posterior a la de entrada.` };
      }
      rows.push({ weekday, startMinute: start, endMinute: end });

      // Segundo turno (comida de por medio). Opcional: si viene vacío,
      // simplemente ese día tiene un solo rango.
      const raw2Start = String(formData.get(`start_${weekday}_2`) || "");
      const raw2End = String(formData.get(`end_${weekday}_2`) || "");
      if (!raw2Start && !raw2End) continue;

      const start2 = toMinutes(raw2Start);
      const end2 = toMinutes(raw2End);
      if (start2 === null || end2 === null) {
        return { ok: false, message: `${dia}: completa las dos horas del segundo turno, o déjalo vacío.` };
      }
      if (end2 <= start2) {
        return { ok: false, message: `${dia}: en el segundo turno la salida debe ser posterior a la entrada.` };
      }
      // Traslape entre los dos turnos del mismo día: con rangos encimados el
      // motor de agenda ofrecería el mismo espacio dos veces.
      if (start2 < end) {
        return {
          ok: false,
          message: `${dia}: el segundo turno debe empezar después de que termine el primero.`,
        };
      }

      rows.push({ weekday, startMinute: start2, endMinute: end2 });
    }

    await db.$transaction(async (tx) => {
      await tx.doctorSchedule.deleteMany({ where: { organizationId: session.organizationId, doctorId } });
      if (rows.length > 0) {
        await tx.doctorSchedule.createMany({
          data: rows.map((r) => ({ ...r, organizationId: session.organizationId, doctorId })),
        });
      }
    });

    revalidatePath("/settings");
    return {
      ok: true,
      message: rows.length === 0 ? "Horario vacío: el médico no tendrá disponibilidad." : "Horario guardado.",
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error inesperado." };
  }
}
