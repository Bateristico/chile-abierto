import { describe, expect, it } from "vitest";
import { usableFacts, validateInsight } from "@/lib/agents/insights";

const facts = usableFacts();
const good = {
  id: "salud-pesa",
  cross: "Presupuesto 2027",
  title: "Salud recibe $18,3 billones en el Proyecto 2027, con un alza real de 4,7%.",
  summary: "Es la partida más grande del cuadro por partida del Proyecto 2027.",
  factIds: ["ppto2027.partida.salud", "ppto2027.var.salud"],
  alternatives: ["La base 2026 incluye ajustes del año."],
  wouldChange: "Cambios en la Comisión Mixta.",
};

describe("AI insight gate", () => {
  it("accepts an insight whose numbers come from the facts it cites", () => {
    expect(validateInsight(good, facts).ok).toBe(true);
  });

  it("rejects a number that is not in the cited facts, even if it exists elsewhere", () => {
    const r = validateInsight({ ...good, title: "Salud sube 4,7% y el Gobierno Central gasta $91,2 billones." }, facts);
    expect(r.ok).toBe(false);
  });

  it("rejects invented figures", () => {
    const r = validateInsight({ ...good, title: "Salud recibe $18,3 billones, un alza real de 9,4%." }, facts);
    expect(r.ok).toBe(false);
  });

  it("rejects citations to facts that don't exist", () => {
    const r = validateInsight({ ...good, factIds: ["ppto2027.partida.salud", "inventado.dato"] }, facts);
    expect(r.ok).toBe(false);
  });

  it("rejects malformed proposals", () => {
    expect(validateInsight({ title: "x" }, facts).ok).toBe(false);
    expect(validateInsight({ ...good, factIds: ["ppto2027.partida.salud"] }, facts).ok).toBe(false);
  });
});
