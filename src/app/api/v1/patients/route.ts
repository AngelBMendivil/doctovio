import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { listPatients, createPatient } from "@/lib/services/patients";
import { createPatientSchema } from "@/lib/validations/patient";

/**
 * API REST v1 — preparada para integraciones externas futuras
 * (portal de terceros, apps móviles, BI). Usa la misma sesión que la app
 * web (cookie httpOnly); para integraciones server-to-server se recomienda
 * migrar a API keys por organización antes de exponerla públicamente.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const result = await listPatients(session.organizationId, {
    search: searchParams.get("q") ?? undefined,
    page: Number(searchParams.get("page") ?? 1),
    pageSize: Number(searchParams.get("pageSize") ?? 20),
  });

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  // Nota: los asistentes SÍ pueden crear pacientes (regla de negocio del MVP).
  const body = await request.json();
  const parsed = createPatientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }

  const patient = await createPatient(session.organizationId, session.userId, parsed.data);
  return NextResponse.json(patient, { status: 201 });
}
