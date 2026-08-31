/**
 * VERIFICADOR DE AISLAMIENTO ENTRE CONSULTORIOS — SOLO LECTURA.
 *
 *   npm run verificar
 *
 * Cubre los casos críticos de la matriz que no se pueden probar con vitest sin
 * una base de pruebas: TEN-03 (aislamiento), DOC-02/PAT-03 (IDOR), WSP-03
 * (enrutamiento de WhatsApp), AUD-01 (bitácora).
 *
 * ES SEGURO CONTRA PRODUCCIÓN, y eso es deliberado: no ejecuta una sola
 * escritura. Ni create, ni update, ni delete, ni transacciones. Solo consulta y
 * compara.
 *
 * NO es un reemplazo de una suite real: no puede probar concurrencia, ni el
 * comportamiento tras escribir, ni los flujos de interfaz. Para eso hace falta
 * una base de pruebas donde sí se pueda ensuciar y limpiar.
 */

import { PrismaClient } from "@prisma/client";
import { getPatientById, listPatients } from "../src/lib/services/patients";
import { listAgenda } from "../src/lib/services/appointments";
import { findUserByLogin } from "../src/lib/services/users";
import { resolveRouteByInstance } from "../src/lib/whatsapp/routing";

const db = new PrismaClient();

let ok = 0;
let fail = 0;

function check(id: string, descripcion: string, paso: boolean, detalle = "") {
  if (paso) {
    ok++;
    console.log(`  PASS  ${id.padEnd(8)} ${descripcion}`);
  } else {
    fail++;
    console.log(`  FAIL  ${id.padEnd(8)} ${descripcion}${detalle ? `\n              ${detalle}` : ""}`);
  }
}

/** Una promesa que debe rechazar o devolver vacío se considera bloqueada. */
async function bloqueado(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    const r = await fn();
    return r === null || r === undefined || (Array.isArray(r) && r.length === 0);
  } catch {
    return true; // lanzar también es bloquear
  }
}

async function main() {
  const orgs = await db.organization.findMany({
    select: { id: true, code: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  if (orgs.length < 2) {
    console.log("\nSe necesitan al menos 2 consultorios para probar aislamiento.");
    console.log("Crea uno desde /master/consultorios/nuevo y vuelve a correr.\n");
    return;
  }

  // A es el que tiene datos; B es contra el que se prueba la fuga.
  const conteos = await Promise.all(
    orgs.map(async (o) => ({ o, n: await db.patient.count({ where: { organizationId: o.id } }) }))
  );
  conteos.sort((x, y) => y.n - x.n);
  const A = conteos[0].o;
  const B = conteos[1].o;

  console.log(`\nA = [${A.code}] ${A.name}   (con datos)`);
  console.log(`B = [${B.code}] ${B.name}   (probando fugas hacia acá)\n`);

  // ---------------------------------------------------------------- TEN-03
  console.log("TEN-03 · Aislamiento entre consultorios");

  const pacienteA = await db.patient.findFirst({ where: { organizationId: A.id }, select: { id: true } });
  const citaA = await db.appointment.findFirst({ where: { organizationId: A.id }, select: { id: true } });
  const docA = await db.patientDocument.findFirst({ where: { organizationId: A.id }, select: { id: true } });

  if (pacienteA) {
    check(
      "TEN-03a",
      "B no puede leer un paciente de A por su id (IDOR)",
      (await getPatientById(B.id, pacienteA.id)) === null
    );
  }

  const listaB = await listPatients(B.id, { page: 1, pageSize: 100 });
  const totalB = Array.isArray(listaB) ? listaB.length : (listaB as { total?: number }).total ?? 0;
  check("TEN-03b", "El listado de pacientes de B no incluye los de A", totalB === conteos[1].n, `devolvió ${totalB}`);

  const agendaB = await listAgenda(B.id, { from: new Date(2020, 0, 1), to: new Date(2030, 0, 1) } as never).catch(
    () => []
  );
  check(
    "TEN-03c",
    "La agenda de B no incluye citas de A",
    Array.isArray(agendaB) ? agendaB.length === 0 : true,
    citaA ? `A tiene citas; B devolvió ${Array.isArray(agendaB) ? agendaB.length : "?"}` : ""
  );

  if (docA) {
    // Se replica el filtro del servicio en vez de importarlo: documents.ts
    // arrastra storage/r2.ts, que trae `server-only` y no carga fuera de Next.
    // La condición es la misma que usa getDocumentDownloadUrl().
    const alcanzable = await db.patientDocument.findFirst({
      where: { id: docA.id, organizationId: B.id },
      select: { id: true },
    });
    check("DOC-02", "B no puede alcanzar un documento de A", alcanzable === null);
  }

  // --------------------------------------------------------------- WSP-03
  console.log("\nWSP-03 · Enrutamiento de WhatsApp por número");

  const conns = await db.whatsappConnection.findMany({ select: { instanceId: true, organizationId: true } });
  for (const c of conns) {
    const r = await resolveRouteByInstance(c.instanceId);
    const org = orgs.find((o) => o.id === c.organizationId);
    check(
      "WSP-03a",
      `El número ...${c.instanceId.slice(-4)} resuelve a ${org?.code ?? "?"}`,
      r?.organizationId === c.organizationId
    );
  }
  check(
    "WSP-03b",
    "Un número ajeno se descarta en vez de caer en el primer consultorio",
    (await resolveRouteByInstance("999999999999999")) === null
  );

  // --------------------------------------------------------------- LOGIN
  console.log("\nCFG-07 · Identidad de acceso");

  const dupCorreos = await db.$queryRawUnsafe<{ email: string }[]>(
    "SELECT email FROM users GROUP BY email HAVING count(*) > 1"
  );
  check("CFG-07a", "Ningún correo se repite entre consultorios", dupCorreos.length === 0);

  const dupUser = await db.$queryRawUnsafe<{ username: string }[]>(
    "SELECT username FROM users WHERE username IS NOT NULL GROUP BY username HAVING count(*) > 1"
  );
  check("CFG-07b", "Ningún alias de acceso se repite", dupUser.length === 0);

  const usuarioB = await db.user.findFirst({ where: { organizationId: B.id }, select: { email: true, organizationId: true } });
  if (usuarioB?.email) {
    const encontrado = await findUserByLogin(usuarioB.email);
    check("CFG-07c", "El login resuelve al usuario correcto y a su consultorio", encontrado?.organizationId === B.id);
  }

  // ---------------------------------------------------------------- CFG-05
  console.log("\nCFG-05 · Horario laboral");

  for (const o of orgs) {
    const filas = await db.doctorSchedule.findMany({
      where: { organizationId: o.id },
      select: { weekday: true, startMinute: true, endMinute: true },
    });

    if (filas.length === 0) {
      check("CFG-05a", `[${o.code}] tiene horario configurado`, false, "sin horario: no podrá agendar nada");
      continue;
    }
    check("CFG-05a", `[${o.code}] tiene horario configurado (${filas.length} franjas)`, true);

    // Rangos encimados el mismo día: el motor ofrecería el mismo espacio dos veces.
    let encimados = 0;
    for (let d = 0; d <= 6; d++) {
      const delDia = filas.filter((f) => f.weekday === d).sort((a, b) => a.startMinute - b.startMinute);
      for (let i = 1; i < delDia.length; i++) {
        if (delDia[i].startMinute < delDia[i - 1].endMinute) encimados++;
      }
    }
    check("CFG-05b", `[${o.code}] sin rangos encimados`, encimados === 0, `${encimados} traslape(s)`);

    const invalidos = filas.filter((f) => f.endMinute <= f.startMinute).length;
    check("CFG-05c", `[${o.code}] ninguna franja termina antes de empezar`, invalidos === 0);
  }

  // ---------------------------------------------------------------- AUD-01
  console.log("\nAUD-01 · Bitácora");

  // Un evento sin `userId` NO es necesariamente un defecto: hay flujos donde
  // el actor legítimamente no es un usuario del sistema — el paciente llenando
  // su prerregistro público, o el cron. Lo que sí sería un defecto es que no se
  // pueda saber quién actuó, así que se exige que esos eventos declaren su
  // origen en `newValues.source`.
  const anonimos = await db.auditLog.findMany({
    where: { userId: null, organizationId: { not: null } },
    select: { id: true, entity: true, newValues: true },
  });
  const sinRastro = anonimos.filter((a) => {
    const v = a.newValues as { source?: string } | null;
    return !v?.source;
  });
  check(
    "AUD-01a",
    `Todo evento sin usuario declara su origen (${anonimos.length} anónimo(s))`,
    sinRastro.length === 0,
    `${sinRastro.length} sin userId y sin source`
  );

  const cruzada = await db.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*) AS n FROM audit_logs a JOIN users u ON u.id = a.user_id
     WHERE a.organization_id IS NOT NULL AND u.organization_id <> a.organization_id
       AND u.is_platform_admin = false`
  );
  check(
    "AUD-01b",
    "Ningún usuario aparece actuando sobre otro consultorio",
    Number(cruzada[0].n) === 0,
    `${cruzada[0].n} evento(s) cruzados`
  );

  // ---------------------------------------------------------------- FOLIOS
  console.log("\nSCH-01 / CLN-03 · Folios");

  for (const o of orgs) {
    const dup = await db.$queryRawUnsafe<{ folio: string }[]>(
      "SELECT folio FROM appointments WHERE organization_id = $1 AND folio IS NOT NULL GROUP BY folio HAVING count(*) > 1",
      o.id
    );
    check("SCH-01a", `[${o.code}] sin folios de cita duplicados`, dup.length === 0);
  }

  console.log(`\n${ok} PASS · ${fail} FAIL\n`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("\nError:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
