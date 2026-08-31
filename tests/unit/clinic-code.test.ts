import { describe, it, expect } from "vitest";
import {
  suggestClinicCode,
  resolveClinicCode,
  isValidClinicCode,
  suggestUsername,
  resolveUsername,
  looksLikeEmail,
} from "@/lib/utils/clinic-code";

/**
 * El código del consultorio es INMUTABLE y va dentro del nombre de acceso de
 * cada usuario secundario. Un error aquí no es cosmético: si el código
 * cambiara, la gente que ya tiene `clp.carlos` se quedaría sin poder entrar.
 */
describe("suggestClinicCode", () => {
  it("toma la inicial de cada palabra significativa", () => {
    expect(suggestClinicCode("Centro Médico del Valle")).toBe("CMV");
  });

  it("ignora las palabras vacías (de, del, la, y)", () => {
    expect(suggestClinicCode("Centro de la Salud")).toBe("CSL");
    expect(suggestClinicCode("Clinica del Norte")).toBe("CNR");
  });

  it("completa con consonantes cuando faltan letras", () => {
    // CL de Clínica-López, más la P de LóPez.
    expect(suggestClinicCode("Clínica López")).toBe("CLP");
  });

  it("quita acentos y la eñe", () => {
    // Muñoz → MUNOZ, así que CM + la N de muNoz.
    expect(suggestClinicCode("Clínica Muñoz")).toBe("CMN");
    // Ángeles → ANGELES: la inicial es A, no Á. Luego MA + la N de aNgeles.
    expect(suggestClinicCode("Médica Ángeles")).toBe("MAN");
  });

  it("ignora números y signos del nombre comercial", () => {
    expect(suggestClinicCode("Dental 2000 S.A. de C.V.")).toBe("DSC");
  });

  it("devuelve 3 caracteres aunque el nombre sea de una sola palabra corta", () => {
    // Sin esto saldrían códigos de 1 o 2 letras, que chocarían constantemente.
    expect(suggestClinicCode("Ax")).toHaveLength(3);
    expect(suggestClinicCode("Sol")).toHaveLength(3);
  });

  it("devuelve cadena vacía si el nombre no tiene letras", () => {
    expect(suggestClinicCode("123")).toBe("");
    expect(suggestClinicCode("   ")).toBe("");
  });

  it("siempre devuelve como máximo 3 caracteres", () => {
    const nombres = ["Centro Médico Nacional Siglo XXI de Especialidades", "Clínica López", "A B C D E F"];
    nombres.forEach((n) => expect(suggestClinicCode(n).length).toBeLessThanOrEqual(3));
  });
});

describe("resolveClinicCode — unicidad en la plataforma", () => {
  it("devuelve el código tal cual si está libre", () => {
    expect(resolveClinicCode("CLP", new Set())).toBe("CLP");
  });

  it("agrega un número si ya está ocupado", () => {
    expect(resolveClinicCode("CLP", new Set(["CLP"]))).toBe("CLP2");
  });

  it("sigue subiendo mientras haya choques", () => {
    expect(resolveClinicCode("CLP", new Set(["CLP", "CLP2", "CLP3"]))).toBe("CLP4");
  });
});

describe("isValidClinicCode", () => {
  it("acepta los códigos que genera el sistema", () => {
    expect(isValidClinicCode("CLP")).toBe(true);
    expect(isValidClinicCode("CLP2")).toBe(true);
    expect(isValidClinicCode("DS")).toBe(true);
  });

  it("rechaza minúsculas, símbolos y códigos vacíos", () => {
    expect(isValidClinicCode("clp")).toBe(false);
    expect(isValidClinicCode("CL-P")).toBe(false);
    expect(isValidClinicCode("")).toBe(false);
    expect(isValidClinicCode("CLINICA")).toBe(false);
  });
});

describe("suggestUsername", () => {
  it("arma codigo.nombre en minúsculas", () => {
    expect(suggestUsername("CLP", "Carlos Ramírez")).toBe("clp.carlos");
    expect(suggestUsername("CLP", "María Fernanda González")).toBe("clp.maria");
  });

  it("usa solo el primer nombre", () => {
    // El usuario lo teclea todos los días para entrar: entre más corto, mejor.
    expect(suggestUsername("DSO", "Ana Sofía Martínez Pérez")).toBe("dso.ana");
  });

  it("quita acentos", () => {
    expect(suggestUsername("CLP", "Ángel Mendívil")).toBe("clp.angel");
    expect(suggestUsername("CLP", "Iñaki Núñez")).toBe("clp.inaki");
  });

  it("NO incluye el rol", () => {
    // Si mañana cambia de rol conserva su nombre de acceso.
    const u = suggestUsername("CLP", "Carlos Ramírez");
    expect(u).not.toContain("doctor");
    expect(u).not.toContain("admin");
    expect(u).toBe("clp.carlos");
  });

  it("devuelve vacío si el nombre no tiene letras", () => {
    expect(suggestUsername("CLP", "123")).toBe("");
  });
});

describe("resolveUsername — dos personas con el mismo nombre", () => {
  it("deja el primero sin número", () => {
    expect(resolveUsername("clp.carlos", new Set())).toBe("clp.carlos");
  });

  it("numera del segundo en adelante", () => {
    expect(resolveUsername("clp.carlos", new Set(["clp.carlos"]))).toBe("clp.carlos2");
    expect(resolveUsername("clp.carlos", new Set(["clp.carlos", "clp.carlos2"]))).toBe("clp.carlos3");
  });

  it("el número va en el nombre, no en el código", () => {
    // "el segundo Carlos de CLP", no "el consultorio CLP2".
    const r = resolveUsername("clp.carlos", new Set(["clp.carlos"]));
    expect(r.startsWith("clp.")).toBe(true);
  });
});

describe("looksLikeEmail — decide cómo buscar en el login", () => {
  it("reconoce un correo", () => {
    expect(looksLikeEmail("doctor@clinicalopez.com")).toBe(true);
  });

  it("reconoce un nombre de usuario", () => {
    expect(looksLikeEmail("clp.carlos")).toBe(false);
    // El punto NO lo convierte en correo: es justo el formato del username.
    expect(looksLikeEmail("clp.carlos2")).toBe(false);
  });
});
