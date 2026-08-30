/**
 * Alta y administración de consultorios desde la terminal.
 *
 * Mientras no exista el panel de SUPER_ADMIN, esta es la puerta para dar de
 * alta un consultorio nuevo. Usa el mismo `createClinic()` que usará el panel,
 * así que lo que se pruebe aquí es lo que va a correr allá.
 *
 *   npm run consultorio -- listar
 *   npm run consultorio -- crear consultorio-ejemplo.json
 *   npm run consultorio -- suspender <id>
 *   npm run consultorio -- activar <id>
 *
 * OJO: lee el DATABASE_URL del .env. Hoy ese .env apunta a PRODUCCIÓN, así que
 * lo que hagas aquí le pasa a la base real. El comando `crear` te muestra lo
 * que va a hacer y pide confirmación antes de escribir.
 */

import { readFileSync } from "fs";
import { createInterface } from "readline";
import {
  createClinic,
  listClinics,
  setClinicActive,
  setPlatformAdmin,
  listPlatformAdmins,
  type CreateClinicInput,
} from "../src/lib/services/clinics";
import { resetUserPasswordGlobal } from "../src/lib/services/users";
import { db } from "../src/lib/db";

/**
 * Pregunta algo sin mostrarlo en pantalla.
 *
 * Se usa para contraseñas: pasarlas como argumento del comando las dejaría en
 * el historial de la terminal, donde sobreviven mucho más de lo que uno cree.
 */
function preguntarOculto(pregunta: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });

    let silenciar = false;
    // readline escribe cada tecla mediante este método; se intercepta para no
    // hacer eco de lo que se teclea después del prompt.
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
      if (!silenciar) process.stdout.write(s);
    };

    rl.question(pregunta, (respuesta) => {
      process.stdout.write("\n");
      rl.close();
      resolve(respuesta);
    });

    // Después de que el prompt ya se escribió.
    silenciar = true;
  });
}

function confirmar(pregunta: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${pregunta} (escribe "si" para continuar): `, (respuesta) => {
      rl.close();
      resolve(respuesta.trim().toLowerCase() === "si");
    });
  });
}

const hora = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

async function listar() {
  const clinics = await listClinics();

  if (clinics.length === 0) {
    console.log("No hay consultorios.");
    return;
  }

  console.log(`\n${clinics.length} consultorio(s):\n`);
  for (const c of clinics) {
    console.log(`  ${c.name}`);
    console.log(`    id          ${c.id}`);
    console.log(`    estado      ${c.isActive ? "activo" : "SUSPENDIDO"}`);
    console.log(`    usuarios    ${c.users}   pacientes ${c.patients}   citas ${c.appointments}`);
    console.log(`    whatsapp    ${c.whatsapp ? "conectado" : "sin número asignado"}`);
    // Sin horario el motor de agenda no ofrece un solo espacio.
    console.log(`    horario     ${c.hasSchedule ? "configurado" : "SIN HORARIO — no podrá agendar"}`);
    console.log("");
  }
}

async function crear(rutaJson: string) {
  let input: CreateClinicInput;
  try {
    input = JSON.parse(readFileSync(rutaJson, "utf8"));
  } catch (e) {
    throw new Error(`No pude leer ${rutaJson}: ${e instanceof Error ? e.message : e}`);
  }

  if (!input.name || !input.admin?.email || !input.admin?.password) {
    throw new Error("El archivo necesita al menos: name, admin.email y admin.password.");
  }

  const horarios = input.schedule;
  console.log("\nSe va a crear:\n");
  console.log(`  Consultorio   ${input.name}`);
  console.log(`  Sucursal      ${input.branch?.name ?? "Consultorio principal"}`);
  console.log(`  Admin         ${input.admin.fullName} <${input.admin.email}>`);
  console.log(
    `  Médico        ${input.doctor ? `${input.doctor.fullName} <${input.doctor.email}>` : "(el admin también será el médico)"}`
  );
  console.log(
    `  Horario       ${
      horarios ? horarios.map((s) => `d${s.weekday} ${hora(s.startMinute)}-${hora(s.endMinute)}`).join(", ") : "lun-vie 09:00-14:00 y 16:00-19:00 (por defecto)"
    }`
  );
  console.log(`  WhatsApp      ${input.whatsapp ? input.whatsapp.instanceId : "sin número (el bot no contestará)"}`);
  console.log(`\n  Base de datos: ${(process.env.DATABASE_URL ?? "").replace(/:\/\/[^@]*@/, "://***@")}\n`);

  if (!(await confirmar("¿Creo este consultorio?"))) {
    console.log("Cancelado. No se escribió nada.");
    return;
  }

  const r = await createClinic(input);

  console.log(`\nListo. Consultorio "${r.name}" creado.\n`);
  console.log(`  id consultorio  ${r.organizationId}`);
  console.log(`  entra con       ${r.adminEmail}`);
  console.log(`  médico          ${r.doctorEmail}`);
  console.log(`  horarios        ${r.scheduleRows} franjas`);
  console.log(`  whatsapp        ${r.whatsapp ? "número asignado" : "SIN número — el bot no contestará"}`);
  console.log("");
}

async function cambiarEstado(id: string, activo: boolean) {
  const r = await setClinicActive(id, activo);
  console.log(`"${r.name}" quedó ${r.isActive ? "ACTIVO" : "SUSPENDIDO"}.`);
  if (!activo) {
    console.log("No se borró nada: al reactivarlo todo vuelve tal como estaba.");
  }
}

/**
 * Nombra al operador de plataforma.
 *
 * Vive aquí y no en una pantalla a propósito: el primer operador no puede
 * crearse desde dentro —huevo y gallina— y darse el privilegio a uno mismo
 * desde la interfaz es exactamente lo que no debe poder hacerse.
 */
async function maestro(email: string, quitar: boolean) {
  const u = await setPlatformAdmin(email, !quitar);
  console.log(
    u.isPlatformAdmin
      ? `${u.fullName} <${u.email}> ya es operador de plataforma. Entra en /admin.`
      : `${u.fullName} <${u.email}> dejó de ser operador de plataforma.`
  );
}

async function listarMaestros() {
  const admins = await listPlatformAdmins();
  if (admins.length === 0) {
    console.log("No hay operadores de plataforma. Nadie puede entrar a /admin.");
    console.log('Nombra uno con:  npm run consultorio -- maestro tu@correo.com');
    return;
  }
  console.log(`\n${admins.length} operador(es) de plataforma:\n`);
  admins.forEach((a) =>
    console.log(`  ${a.fullName} <${a.email}>${a.isActive ? "" : "  (usuario inactivo)"}`)
  );
  console.log("");
}

/**
 * Restablece la contraseña de un usuario.
 *
 * Las contraseñas se guardan como hash bcrypt: son irrecuperables por diseño.
 * Cuando alguien la olvida, el único camino es ponerle una nueva.
 */
async function contrasena(email: string) {
  const nueva = await preguntarOculto(`Nueva contraseña para ${email}: `);
  if (nueva.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.");

  const repetir = await preguntarOculto("Repítela: ");
  if (nueva !== repetir) throw new Error("Las contraseñas no coinciden. No se cambió nada.");

  const u = await resetUserPasswordGlobal(email, nueva);
  console.log(`\nListo. ${u.fullName} <${u.email}> ya puede entrar con la contraseña nueva.`);
}

async function main() {
  const [comando, arg] = process.argv.slice(2);

  switch (comando) {
    case "listar":
      return listar();
    case "crear":
      if (!arg) throw new Error("Falta la ruta del archivo JSON.");
      return crear(arg);
    case "suspender":
      if (!arg) throw new Error("Falta el id del consultorio.");
      return cambiarEstado(arg, false);
    case "activar":
      if (!arg) throw new Error("Falta el id del consultorio.");
      return cambiarEstado(arg, true);
    case "maestro":
      if (!arg) throw new Error("Falta el correo del usuario.");
      return maestro(arg, false);
    case "quitar-maestro":
      if (!arg) throw new Error("Falta el correo del usuario.");
      return maestro(arg, true);
    case "maestros":
      return listarMaestros();
    case "contrasena":
    case "contraseña":
      if (!arg) throw new Error("Falta el correo del usuario.");
      return contrasena(arg);
    default:
      console.log("Comandos:");
      console.log("  listar                      consultorios y su salud");
      console.log("  crear <archivo.json>        da de alta un consultorio");
      console.log("  suspender <id>              corta el acceso (no borra nada)");
      console.log("  activar <id>                lo reactiva");
      console.log("  maestros                    quién puede entrar a /admin");
      console.log("  maestro <correo>            nombra operador de plataforma");
      console.log("  quitar-maestro <correo>     le quita el privilegio");
      console.log("  contrasena <correo>         restablece su contraseña");
  }
}

main()
  .catch((e) => {
    console.error(`\nError: ${e instanceof Error ? e.message : e}\n`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
