import { describe, expect, it } from "vitest";
import { agreementIndex, deputyStats, majorityOf, partyAgreement, partyStats, splitByParty } from "@/lib/congreso/metrics";
import { budgetGrid, partidaOf, proponente, support } from "@/lib/congreso/budget-votes";
import { encodeVotes, parseMilitancias } from "@/lib/connectors/congreso";
import { parseXml } from "@/lib/connectors/camara";
import type { CongresoData, Periodo } from "@/lib/congreso/types";

// Five deputies: two in A, two in B, one who moves from IND to A on 2025-01-01.
const mil = (alias: string, desde = "2022-03-11", hasta = "2026-03-10") => ({ desde, hasta, alias, nombre: alias });
const periodo: Periodo = {
  id: 10, nombre: "2022–2026", inicio: "2022-03-11", fin: "2026-03-10", cuarentena: [],
  orden: [1, 2, 3, 4, 5],
  diputados: [
    { id: 1, nombre: "a1", sexo: "F", militancias: [mil("A")] },
    { id: 2, nombre: "a2", sexo: "M", militancias: [mil("A")] },
    { id: 3, nombre: "b1", sexo: "F", militancias: [mil("B")] },
    { id: 4, nombre: "b2", sexo: "M", militancias: [mil("B")] },
    { id: 5, nombre: "x", sexo: "M", militancias: [mil("IND", "2022-03-11", "2024-12-31"), mil("A", "2025-01-01")] },
  ],
  votaciones: [
    { id: 100, f: "2024-05-01T10:00:00", d: "Boletín N° 17870-05", b: "17870-05", si: 3, no: 2, ab: 0, q: "Quórum Simple", r: "Aprobado", art: "del Ejecutivo Part 16 - Cap 01 - Prog 01", c: "11001" },
    { id: 101, f: "2025-06-01T10:00:00", d: "Boletín N° 17870-05", b: "17870-05", si: 2, no: 2, ab: 1, q: "Quórum Simple", r: "Rechazado", art: "de la diputada Rojas Camila Part 29 - Cap 01", c: "10002" },
    { id: 102, f: "2025-06-02T10:00:00", d: "Boletín N° 99999-01", b: "99999-01", si: 4, no: 0, ab: 0, q: "Quórum Simple", r: "Aprobado", c: "1111." },
  ],
};

describe("vote engine", () => {
  it("splits a vote by the party each deputy had that day", () => {
    const early = splitByParty(periodo, periodo.votaciones[0]);
    expect(early.get("A")).toMatchObject({ favor: 2, contra: 0 });
    expect(early.get("IND")).toMatchObject({ favor: 1 });
    const late = splitByParty(periodo, periodo.votaciones[1]);
    expect(late.get("A")).toMatchObject({ favor: 1, contra: 1, abst: 1 });
  });

  it("measures agreement: 1 when united, 0 on a three-way split", () => {
    expect(agreementIndex({ favor: 4, contra: 0, abst: 0, noVota: 0, ausente: 0 })).toBe(1);
    expect(agreementIndex({ favor: 1, contra: 1, abst: 1, noVota: 0, ausente: 0 })).toBe(0);
    expect(agreementIndex({ favor: 2, contra: 0, abst: 0, noVota: 0, ausente: 0 })).toBeNull();
    expect(majorityOf({ favor: 2, contra: 2, abst: 0, noVota: 0, ausente: 0 })).toBeNull();
  });

  it("computes per-deputy participation, party line (others only) and winning side", () => {
    const s = deputyStats(periodo);
    const x = s.find((d) => d.id === 5)!;
    expect(x.registradas).toBe(2); // absent from vote 102
    expect(x.abst).toBe(1);
    expect(x.comparables).toBe(0); // party A has only 2 other members: no clear line
    const a1 = s.find((d) => d.id === 1)!;
    expect(a1.ladoGanador).toBe(2); // voted a favor on the rejected vote 101
    expect(a1.conResultado).toBe(3);
  });

  it("counts seats today and party agreement", () => {
    const ps = partyStats(periodo, "2026-01-01");
    expect(ps.find((p) => p.alias === "A")!.escanos).toBe(3);
    const ag = partyAgreement(periodo, ["A", "B"]);
    expect(ag[0].n).toBeGreaterThan(0);
  });
});

describe("budget votes", () => {
  it("reads the partida and the proposer from the Cámara's vote text", () => {
    expect(partidaOf("del Ejecutivo\n\nPart 03 - Cap 03 - Prog 01 - Sub 21")).toBe(3);
    expect(partidaOf("Enmienda del Senado que reemplaza íntegramente la Partida 32 Ministerio de Seguridad")).toBe(32);
    expect(partidaOf("En votación la indicación N° 1 de la Partida N° 01 PRESIDENCIA")).toBe(1);
    expect(partidaOf("Para agregar un nuevo artículo")).toBeNull();
    expect(partidaOf("Partida 00 Indicación 84 - En votación la reclamación contra la declaración de inadmisibilidad")).toBe(0);
    expect(proponente("del Ejecutivo Part 16")).toBe("Ejecutivo");
    expect(proponente("de la diputada Rojas Camila  Part 29")).toBe("Rojas Camila");
  });

  it("builds the partida × party grid", () => {
    const data: CongresoData = { generadoEl: "", periodos: [periodo], proyectos: {} };
    const g = budgetGrid(data, "17870-05", 2026, 1)!;
    expect(g.votaciones).toBe(2);
    expect(g.filas.map((f) => f.partida)).toEqual([16, 29]);
    expect(support(g.filas[0].porPartido.B)).toBe(0);
    expect(support(g.filas[0].porPartido.A)).toBe(1);
  });
});

describe("congreso connector helpers", () => {
  it("encodes votes aligned with the period order, '.' for absent", () => {
    expect(encodeVotes([1, 2, 3], [{ diputadoId: 3, codigo: 0 }, { diputadoId: 1, codigo: 4 }])).toBe("4.0");
  });
  it("parses militancias with open ends", () => {
    const ms = parseMilitancias(parseXml(`<Diputado><Militancias><Militancia><FechaInicio>2024-07-03T00:00:00</FechaInicio><FechaTermino xsi:nil="true" /><Partido><Id>FA</Id><Nombre>Frente Amplio</Nombre><Alias>FA</Alias></Partido></Militancia></Militancias></Diputado>`));
    expect(ms).toEqual([{ desde: "2024-07-03", hasta: "9999-12-31", alias: "FA", nombre: "Frente Amplio" }]);
  });
});
