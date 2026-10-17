import { describe, expect, it } from "vitest";
import { politicalMap, colleagues, topEigen, analyse } from "@/lib/congreso/analysis";
import type { Periodo, Votacion } from "@/lib/congreso/types";

// Two blocs of 6 that disagree on half the votes; the larger bloc (A, 7 incl. one swing) must sit on the positive side.
function makePeriod(): Periodo {
  const orden = Array.from({ length: 13 }, (_, i) => i + 1);
  const party = (id: number) => (id <= 7 ? "A" : "B");
  const diputados = orden.map((id) => ({ id, nombre: `d${id}`, sexo: "M", militancias: [{ desde: "2022-03-11", hasta: "2026-03-10", alias: party(id), nombre: party(id) }] }));
  const votaciones: Votacion[] = [];
  for (let k = 0; k < 40; k++) {
    const split = k % 2 === 0;
    const c = orden.map((id) => (split ? (party(id) === "A" ? (id === 7 && k % 4 === 0 ? "0" : "1") : "0") : "1")).join("");
    const si = [...c].filter((x) => x === "1").length;
    votaciones.push({ id: 1000 + k, f: `2023-01-${String((k % 28) + 1).padStart(2, "0")}T10:00:00`, d: "x", si, no: 13 - si, ab: 0, q: "", r: si > 6 ? "Aprobado" : "Rechazado", c });
  }
  return { id: 10, nombre: "t", inicio: "2022-03-11", fin: "2026-03-10", diputados, orden, votaciones, cuarentena: [] };
}

describe("analysis", () => {
  it("finds the leading eigenvector of a simple matrix", () => {
    const { values, vectors } = topEigen([[2, 0], [0, 1]], 1);
    expect(values[0]).toBeCloseTo(2, 5);
    expect(Math.abs(vectors[0][0])).toBeCloseTo(1, 5);
  });

  it("separates the two blocs on the first dimension, larger party positive", () => {
    const m = politicalMap(makePeriod(), "2026-03-10");
    const x = (id: number) => m.points.find((p) => p.id === id)!.x;
    expect(x(1)).toBeGreaterThan(0);
    expect(x(10)).toBeLessThan(0);
    expect(x(7)).toBeLessThan(x(1)); // the swing deputy sits between
    expect(m.varianza[0]).toBeGreaterThan(0.5);
    expect(m.votaciones).toBe(20); // only contested votes
  });

  it("ranks closest colleagues within the same bloc", () => {
    const c = colleagues(makePeriod(), 10, 3);
    const d1 = c.find((x) => x.id === 1)!;
    expect(d1.cercanos.every((x) => x.id <= 7)).toBe(true);
    expect(d1.lejanos.every((x) => x.id > 7)).toBe(true);
  });

  it("produces a complete analysis", () => {
    const a = analyse(makePeriod());
    expect(a.partidos.map((p) => p.alias)).toEqual(["A", "B"]);
    expect(a.cohesionAnual.B["2023"].cohesion).toBe(1);
    expect(a.diputados).toHaveLength(13);
  });
});
