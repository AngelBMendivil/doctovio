"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { disconnect } from "@/lib/google/oauth";
import { pullBusyBlocks, processSyncQueue } from "@/lib/services/calendar-sync";

export type ActionState = { ok: boolean; message: string } | null;

/** Un médico solo toca su calendario; el admin, el de cualquiera de su consultorio. */
async function assertCanManage(doctorId: string) {
  const session = await requireSession();
  if (session.role === "DOCTOR" && doctorId !== session.userId) {
    throw new Error("Solo puedes administrar tu propio calendario.");
  }
  if (session.role !== "DOCTOR" && session.role !== "ADMIN") {
    throw new Error("No tienes permiso para administrar calendarios.");
  }
  const doctor = await db.user.findFirst({
    where: { id: doctorId, organizationId: session.organizationId, primaryRole: "DOCTOR" },
  });
  if (!doctor) throw new Error("El médico no existe en esta organización.");
  return session;
}

export async function disconnectGoogleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const doctorId = String(formData.get("doctorId") || "");
    await assertCanManage(doctorId);
    await disconnect(doctorId);

    // Los bloqueos traídos de Google dejan de tener sentido si ya no hay
    // calendario: dejarlos bloquearía horarios sin razón.
    await db.scheduleBlock.deleteMany({ where: { doctorId, kind: "EXTERNAL_CALENDAR" } });

    revalidatePath("/settings");
    return { ok: true, message: "Calendario desconectado y permiso revocado en Google." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error inesperado." };
  }
}

/** Sincroniza a mano: útil para verificar la conexión sin esperar al cron. */
export async function syncGoogleNowAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const doctorId = String(formData.get("doctorId") || "");
    const session = await assertCanManage(doctorId);

    const { blocks } = await pullBusyBlocks(doctorId);
    const { processed } = await processSyncQueue(session.organizationId);

    revalidatePath("/settings");
    return {
      ok: true,
      message: `Listo. ${blocks} evento(s) personal(es) bloquean tu agenda y ${processed} cita(s) se publicaron en Google.`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "No se pudo sincronizar." };
  }
}

/** Enciende o apaga cada sentido de la sincronización por separado. */
export async function toggleGoogleSyncAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const doctorId = String(formData.get("doctorId") || "");
    await assertCanManage(doctorId);

    await db.googleCalendarConnection.update({
      where: { doctorId },
      data: {
        pullBusy: formData.get("pullBusy") === "on",
        pushEvents: formData.get("pushEvents") === "on",
      },
    });

    revalidatePath("/settings");
    return { ok: true, message: "Preferencias guardadas." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error inesperado." };
  }
}
