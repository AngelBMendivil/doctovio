import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { testDb, closeTestDb, codigoUnico } from "./guard";
import {
  createCatalogItem,
  updateCatalogItem,
  listActiveCatalogItems,
  ensureCategories,
  listCategories,
} from "@/lib/services/catalog";
import {
  addTreatmentPlanItem,
  listTreatmentPlan,
  completeTreatment,
  setTreatmentStatus,
} from "@/lib/services/treatment-plan";
import { createQuoteFromPlan, setQuoteStatus, getQuote, listPatientQuotes } from "@/lib/services/quotes";
import { addOdontogramEntry, getOdontogram, getToothHistory } from "@/lib/services/odontogram";
import { getClinicType } from "@/lib/services/clinic-features";
import type { PrismaClient } from "@prisma/client";

/**
 * MÓDULO DENTAL — flujo completo y aislamiento entre consultorios.
 *
 * Lo que estas pruebas cuidan, en orden de importancia:
 *
 * 1. Que el consultorio A no pueda tocar nada de B: ni su paciente, ni su
 *    catálogo, ni su plan, ni sus cotizaciones. Es la familia de bugs que ya
 *    apareció once veces en este proyecto, siempre igual: el servicio recibía
 *    `organizationId` y lo usaba para CREAR la fila, sin validar los ids que
 *    venían del formulario.
 * 2. Que aceptar una cotización NO marque nada como realizado.
 * 3. Que una cotización vieja siga diciendo el precio que se prometió.
 */

let db: PrismaClient;

type Clinica = { orgId: string; doctorId: string; patientId: string };
let A: Clinica;
let B: Clinica;

async function montar(prefijo: string): Promise<Clinica> {
  const org = await db.organization.create({
    data: {
      code: codigoUnico(prefijo),
      name: `QA Dental ${prefijo} ${Date.now()}`,
      type: "DENTAL",
    },
  });
  const doctor = await db.user.create({
    data: {
      organizationId: org.id,
      email: `qa-dental-${prefijo.toLowerCase()}-${Date.now()}@qa.local`,
      passwordHash: "x",
      fullName: `Dentista ${prefijo}`,
      primaryRole: "DOCTOR",
    },
  });
  const paciente = await db.patient.create({
    data: {
      organizationId: org.id,
      recordNumber: `QA-DENT-${prefijo}-${Date.now()}`,
      firstName: prefijo,
      lastLastName: "Paciente",
      birthDate: new Date("1990-01-01"),
      sex: "FEMALE",
    },
  });
  return { orgId: org.id, doctorId: doctor.id, patientId: paciente.id };
}

beforeAll(async () => {
  db = await testDb();
  A = await montar("DA");
  B = await montar("DB");
});

afterAll(async () => {
  await closeTestDb();
});

describe("habilitación del módulo", () => {
  it("un consultorio dental se reconoce como tal", async () => {
    expect(await getClinicType(A.orgId)).toBe("DENTAL");
  });

  it("un consultorio médico existente no cambia de giro", async () => {
    const medico = await db.organization.create({
      data: { code: codigoUnico("DM"), name: `QA Médico ${Date.now()}` },
    });
    // Sin tocar nada: el default del campo nuevo deja al consultorio como
    // estaba. Es lo que tiene que pasar con los que ya existían.
    expect(await getClinicType(medico.id)).toBe("MEDICAL");
  });
});

describe("catálogo del consultorio", () => {
  it("siembra las categorías sugeridas una sola vez", async () => {
    await ensureCategories(A.orgId);
    const primera = await listCategories(A.orgId);
    expect(primera.length).toBeGreaterThan(5);

    // Correrlo otra vez no duplica nada.
    await ensureCategories(A.orgId);
    const segunda = await listCategories(A.orgId);
    expect(segunda.length).toBe(primera.length);
  });

  it("cada consultorio ve SOLO su catálogo", async () => {
    await createCatalogItem(A.orgId, A.doctorId, {
      name: "Resina posterior A",
      type: "SERVICE",
      price: 850,
    });
    await createCatalogItem(B.orgId, B.doctorId, {
      name: "Resina posterior B",
      type: "SERVICE",
      price: 1200,
    });

    const deA = await listActiveCatalogItems(A.orgId);
    const deB = await listActiveCatalogItems(B.orgId);

    expect(deA.some((i) => i.name === "Resina posterior A")).toBe(true);
    expect(deA.some((i) => i.name === "Resina posterior B")).toBe(false);
    expect(deB.some((i) => i.name === "Resina posterior A")).toBe(false);
  });

  it("no deja repetir el código dentro del mismo consultorio", async () => {
    await createCatalogItem(A.orgId, A.doctorId, { name: "Limpieza", code: "LIM001", type: "SERVICE", price: 700 });
    await expect(
      createCatalogItem(A.orgId, A.doctorId, { name: "Otra limpieza", code: "LIM001", type: "SERVICE", price: 900 })
    ).rejects.toThrow(/ya lo usa/i);
  });

  it("dos consultorios SÍ pueden usar el mismo código: son catálogos distintos", async () => {
    const enB = await createCatalogItem(B.orgId, B.doctorId, {
      name: "Limpieza B",
      code: "LIM001",
      type: "SERVICE",
      price: 800,
    });
    expect(enB.code).toBe("LIM001");
  });
});

describe("flujo completo: hallazgo → tratamiento → cotización → realizado", () => {
  it("recorre el caso entero sin que aceptar signifique realizar", async () => {
    // 1. Se encuentra una caries oclusal en el 16.
    const hallazgo = await addOdontogramEntry({
      organizationId: A.orgId,
      patientId: A.patientId,
      doctorId: A.doctorId,
      toothCode: "16",
      surfaces: ["OCCLUSAL_INCISAL"],
      kind: "FINDING",
      code: "CARIES",
    });
    expect(hallazgo.id).toBeTruthy();

    // 2. Se planea la resina, ligada al producto del catálogo.
    const producto = (await listActiveCatalogItems(A.orgId)).find((i) => i.name === "Resina posterior A")!;
    const tratamiento = await addTreatmentPlanItem({
      organizationId: A.orgId,
      patientId: A.patientId,
      userId: A.doctorId,
      toothCode: "16",
      surfaces: ["OCCLUSAL_INCISAL"],
      diagnosis: "Caries oclusal",
      treatmentCode: "RESINA",
      catalogItemId: producto.id,
      findingEntryId: hallazgo.id,
    });

    // El precio se COPIÓ del catálogo, no se apuntó a él.
    expect(tratamiento.unitPrice).toBe(850);
    expect(tratamiento.listPrice).toBe(850);
    expect(tratamiento.status).toBe("PENDING");

    // 3. Se cotiza.
    const cotizacion = await createQuoteFromPlan({
      organizationId: A.orgId,
      patientId: A.patientId,
      userId: A.doctorId,
      treatmentItemIds: [tratamiento.id],
      validDays: 30,
    });
    expect(cotizacion.folio).toMatch(/^COT-\d{6}$/);
    expect(cotizacion.total).toBe(850);
    expect(cotizacion.status).toBe("DRAFT");

    // 4. El paciente la acepta. LA LÍNEA QUE IMPORTA: el tratamiento pasa a
    //    "aceptado" y NO a "realizado". Nadie se ha sentado en el sillón.
    await setQuoteStatus(A.orgId, A.doctorId, cotizacion.id, "ACCEPTED");

    const trasAceptar = await db.treatmentPlanItem.findUnique({ where: { id: tratamiento.id } });
    expect(trasAceptar!.status).toBe("ACCEPTED");
    expect(trasAceptar!.completedAt).toBeNull();
    expect(trasAceptar!.resultEntryId).toBeNull();

    // El odontograma tampoco tiene todavía ninguna resina realizada.
    const antes = await getOdontogram(A.orgId, A.patientId);
    expect(antes.entries.filter((e) => e.code === "RESINA").length).toBe(0);

    // 5. Ahora sí se hace, y ESO escribe en el odontograma.
    const hecho = await completeTreatment({
      organizationId: A.orgId,
      userId: A.doctorId,
      id: tratamiento.id,
    });
    expect(hecho.status).toBe("COMPLETED");
    expect(hecho.resultEntryId).toBeTruthy();

    const despues = await getOdontogram(A.orgId, A.patientId);
    const resina = despues.entries.find((e) => e.code === "RESINA");
    expect(resina).toBeTruthy();
    expect(resina!.kind).toBe("TREATMENT");
    expect(resina!.status).toBe("COMPLETED");
    expect(resina!.surfaces).toContain("OCCLUSAL_INCISAL");

    // 6. El tratamiento hecho tapa al hallazgo en esa cara del diente.
    const estado16 = despues.estados.get("16")!;
    expect(estado16.surfaces.OCCLUSAL_INCISAL?.layer).toBe("DONE");

    // 7. Y la pieza conserva las DOS anotaciones en su historia.
    const historia = await getToothHistory(A.orgId, A.patientId, "16");
    expect(historia.length).toBe(2);
    expect(historia.map((h) => h.code).sort()).toEqual(["CARIES", "RESINA"]);
  });

  it("un tratamiento ya realizado no se puede volver a realizar", async () => {
    const plan = await listTreatmentPlan(A.orgId, A.patientId);
    const hecho = plan.find((p) => p.status === "COMPLETED")!;

    await expect(
      completeTreatment({ organizationId: A.orgId, userId: A.doctorId, id: hecho.id })
    ).rejects.toThrow(/ya estaba marcado/i);
  });

  it("un tratamiento realizado no se cancela desde el plan", async () => {
    const plan = await listTreatmentPlan(A.orgId, A.patientId);
    const hecho = plan.find((p) => p.status === "COMPLETED")!;

    // Deshacerlo desde el plan borraría de la vista un procedimiento que
    // realmente se le hizo a una persona. La corrección va en el odontograma.
    await expect(
      setTreatmentStatus(A.orgId, A.doctorId, hecho.id, "CANCELLED")
    ).rejects.toThrow(/ya se realizó/i);
  });

  it("lo planeado se pinta como pendiente hasta que se hace", async () => {
    const producto = (await listActiveCatalogItems(A.orgId)).find((i) => i.name === "Resina posterior A")!;
    await addTreatmentPlanItem({
      organizationId: A.orgId,
      patientId: A.patientId,
      userId: A.doctorId,
      toothCode: "26",
      surfaces: ["MESIAL"],
      treatmentCode: "RESINA",
      catalogItemId: producto.id,
    });

    const vista = await getOdontogram(A.orgId, A.patientId);
    expect(vista.estados.get("26")!.surfaces.MESIAL?.layer).toBe("PLANNED");
    expect(vista.estados.get("26")!.pendientes).toBe(1);
  });
});

describe("precios históricos", () => {
  it("cambiar el catálogo NO reescribe una cotización ya emitida", async () => {
    const producto = await createCatalogItem(A.orgId, A.doctorId, {
      name: "Extracción quirúrgica",
      type: "SERVICE",
      price: 2500,
    });

    const tratamiento = await addTreatmentPlanItem({
      organizationId: A.orgId,
      patientId: A.patientId,
      userId: A.doctorId,
      toothCode: "38",
      treatmentCode: "EXTRACCION",
      catalogItemId: producto.id,
    });

    const cotizacion = await createQuoteFromPlan({
      organizationId: A.orgId,
      patientId: A.patientId,
      userId: A.doctorId,
      treatmentItemIds: [tratamiento.id],
    });
    expect(cotizacion.total).toBe(2500);

    // Tres meses después sube el precio.
    await updateCatalogItem(A.orgId, A.doctorId, producto.id, {
      name: "Extracción quirúrgica",
      type: "SERVICE",
      price: 3200,
      isActive: true,
    });

    const vigente = await db.catalogItem.findUnique({ where: { id: producto.id } });
    expect(vigente!.price).toBe(3200);

    // La hoja que se le entregó al paciente sigue diciendo 2500.
    const historica = await getQuote(A.orgId, cotizacion.id);
    expect(historica!.total).toBe(2500);
    expect(historica!.items[0].unitPrice).toBe(2500);
    expect(historica!.items[0].name).toBe("Extracción quirúrgica");
  });
});

describe("aislamiento entre consultorios", () => {
  it("A no puede anotar en el odontograma de un paciente de B", async () => {
    await expect(
      addOdontogramEntry({
        organizationId: A.orgId,
        patientId: B.patientId,
        doctorId: A.doctorId,
        toothCode: "11",
        surfaces: ["VESTIBULAR"],
        kind: "FINDING",
        code: "CARIES",
      })
    ).rejects.toThrow(/no existe en este consultorio/i);
  });

  it("A no puede planearle un tratamiento al paciente de B", async () => {
    await expect(
      addTreatmentPlanItem({
        organizationId: A.orgId,
        patientId: B.patientId,
        userId: A.doctorId,
        toothCode: "11",
        treatmentCode: "RESINA",
      })
    ).rejects.toThrow(/no existe en este consultorio/i);
  });

  it("A no puede usar un producto del catálogo de B", async () => {
    const productoDeB = (await listActiveCatalogItems(B.orgId))[0];

    await expect(
      addTreatmentPlanItem({
        organizationId: A.orgId,
        patientId: A.patientId,
        userId: A.doctorId,
        toothCode: "12",
        treatmentCode: "RESINA",
        catalogItemId: productoDeB.id,
      })
    ).rejects.toThrow(/no existe en el catálogo/i);
  });

  it("A no puede cotizarle a su propio paciente los tratamientos de B", async () => {
    const enB = await addTreatmentPlanItem({
      organizationId: B.orgId,
      patientId: B.patientId,
      userId: B.doctorId,
      toothCode: "16",
      treatmentCode: "RESINA",
    });

    await expect(
      createQuoteFromPlan({
        organizationId: A.orgId,
        patientId: A.patientId,
        userId: A.doctorId,
        treatmentItemIds: [enB.id],
      })
    ).rejects.toThrow(/ya no se puede cotizar/i);
  });

  it("A no alcanza una cotización de B ni con el id exacto", async () => {
    const enB = await addTreatmentPlanItem({
      organizationId: B.orgId,
      patientId: B.patientId,
      userId: B.doctorId,
      toothCode: "26",
      treatmentCode: "LIMPIEZA",
    });
    const cotizacionDeB = await createQuoteFromPlan({
      organizationId: B.orgId,
      patientId: B.patientId,
      userId: B.doctorId,
      treatmentItemIds: [enB.id],
    });

    expect(await getQuote(A.orgId, cotizacionDeB.id)).toBeNull();
    await expect(
      setQuoteStatus(A.orgId, A.doctorId, cotizacionDeB.id, "ACCEPTED")
    ).rejects.toThrow(/no existe en este consultorio/i);

    // Y tampoco aparece en el listado del paciente de A.
    const deA = await listPatientQuotes(A.orgId, A.patientId);
    expect(deA.some((q) => q.id === cotizacionDeB.id)).toBe(false);
  });

  it("A no puede marcar como realizado un tratamiento de B", async () => {
    const enB = await addTreatmentPlanItem({
      organizationId: B.orgId,
      patientId: B.patientId,
      userId: B.doctorId,
      toothCode: "36",
      treatmentCode: "RESINA",
      surfaces: ["OCCLUSAL_INCISAL"],
    });

    await expect(
      completeTreatment({ organizationId: A.orgId, userId: A.doctorId, id: enB.id })
    ).rejects.toThrow(/no existe en este consultorio/i);
  });

  it("el odontograma de A no incluye nada de B", async () => {
    const deA = await getOdontogram(A.orgId, A.patientId);
    const pacientes = new Set(deA.entries.map((e) => e.patientId));
    expect([...pacientes]).toEqual([A.patientId]);
  });

  it("cada consultorio lleva su propio consecutivo de folios", async () => {
    const [deA, deB] = await Promise.all([
      db.quote.findMany({ where: { organizationId: A.orgId }, orderBy: { createdAt: "asc" } }),
      db.quote.findMany({ where: { organizationId: B.orgId }, orderBy: { createdAt: "asc" } }),
    ]);

    // Los dos arrancan en COT-000001: son numeraciones independientes, igual
    // que las recetas y las órdenes.
    expect(deA[0].folio).toBe("COT-000001");
    expect(deB[0].folio).toBe("COT-000001");
    expect(deA.map((q) => q.folio)).toEqual([...new Set(deA.map((q) => q.folio))]);
  });
});

describe("validaciones clínicas", () => {
  it("rechaza una pieza que no existe en la boca", async () => {
    await expect(
      addTreatmentPlanItem({
        organizationId: A.orgId,
        patientId: A.patientId,
        userId: A.doctorId,
        toothCode: "19",
        treatmentCode: "RESINA",
      })
    ).rejects.toThrow(/no es una pieza válida/i);
  });

  it("una caries sin superficie no se guarda", async () => {
    await expect(
      addOdontogramEntry({
        organizationId: A.orgId,
        patientId: A.patientId,
        doctorId: A.doctorId,
        toothCode: "14",
        surfaces: [],
        kind: "FINDING",
        code: "CARIES",
      })
    ).rejects.toThrow(/al menos una superficie/i);
  });

  it("una extracción se guarda como pieza completa aunque manden superficies", async () => {
    const e = await addOdontogramEntry({
      organizationId: A.orgId,
      patientId: A.patientId,
      doctorId: A.doctorId,
      toothCode: "48",
      surfaces: ["MESIAL", "DISTAL"],
      kind: "TREATMENT",
      code: "EXTRACCION",
    });
    expect(e.surfaces).toEqual(["WHOLE"]);
  });

  it("cobrar distinto al catálogo exige permiso", async () => {
    const producto = (await listActiveCatalogItems(A.orgId)).find((i) => i.name === "Resina posterior A")!;

    await expect(
      addTreatmentPlanItem({
        organizationId: A.orgId,
        patientId: A.patientId,
        userId: A.doctorId,
        toothCode: "15",
        treatmentCode: "RESINA",
        catalogItemId: producto.id,
        unitPrice: 400,
        canOverridePrice: false,
      })
    ).rejects.toThrow(/no tienes permiso/i);

    // Con permiso sí, y se guardan los DOS precios.
    const conPermiso = await addTreatmentPlanItem({
      organizationId: A.orgId,
      patientId: A.patientId,
      userId: A.doctorId,
      toothCode: "15",
      treatmentCode: "RESINA",
      catalogItemId: producto.id,
      unitPrice: 400,
      canOverridePrice: true,
    });
    expect(conPermiso.unitPrice).toBe(400);
    expect(conPermiso.listPrice).toBe(850);
  });
});
