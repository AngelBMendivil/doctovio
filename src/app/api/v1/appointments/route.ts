import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { listAgenda, createAppointment } from "@/lib/services/appointments";
import { createAppointmentSchema } from "@/lib/validations/appointment";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ? new Date(searchParams.get("from")!) : new Date();
  const to = searchParams.get("to") ? new Date(searchParams.get("to")!) : new Date();

  const appointments = await listAgenda(session.organizationId, {
    from,
    to,
    doctorId: searchParams.get("doctorId") ?? undefined,
    branchId: searchParams.get("branchId") ?? undefined,
  });

  return NextResponse.json(appointments);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const body = await request.json();
  const parsed = createAppointmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const appointment = await createAppointment(session.organizationId, session.userId, parsed.data);
    return NextResponse.json(appointment, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error";
    const status = message.startsWith("OVERLAP") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
