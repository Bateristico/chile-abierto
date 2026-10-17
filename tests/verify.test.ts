import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { verifyFacts } from "@/lib/provenance/verify";
import { parsePrinted } from "@/lib/provenance/parse";
import type { FactInput } from "@/lib/provenance/types";
import { partidaFacts, type PartidasDataset } from "@/lib/budget/partidas";
import { loadFacts } from "@/lib/facts";
import { REQUIRED_FACTS } from "@/lib/required";

const base: FactInput = {
  id: "t.total",
  label: "Total",
  definition: "x",
  value: 91175816,
  unit: "CLP_millones",
  asOf: "2026-09-30",
  domain: "presupuesto",
  sources: [
    { publisher: "dipres", title: "IFP", url: "https://www.dipres.gob.cl/597/articles-433297_doc_pdf.pdf", locator: "Cuadro 4", retrievedAt: "2026-10-17", verifiedBy: "manual", asPrinted: "$91.175.816 millones" },
  ],
};

describe("parsePrinted", () => {
  it("reads Chilean number formats and scales", () => {
    expect(parsePrinted("$91.175.816 millones", "CLP_millones")).toBe(91175816);
    expect(parsePrinted("US$25 mil millones", "USD_millones")).toBe(25000);
    expect(parsePrinted("US$25.000 millones", "USD_millones")).toBe(25000);
    expect(parsePrinted("-1,8% del PIB", "pct_pib")).toBe(-1.8);
    expect(parsePrinted("$105,8 billones", "CLP_millones")).toBeCloseTo(105_800_000);
  });
  it("refuses to compare across currencies", () => {
    expect(parsePrinted("US$194,0 millones", "CLP_miles")).toBeNull();
  });
});

describe("verifyFacts", () => {
  it("grades an official, located source as oficial", () => {
    const [f] = verifyFacts([base]);
    expect(f.status).toBe("oficial");
    expect(f.checks.every((c) => c.passed)).toBe(true);
  });

  it("rejects a value that differs from what the source printed", () => {
    const [f] = verifyFacts([{ ...base, value: 91175817 }]);
    expect(f.status).toBe("pendiente");
    expect(f.checks.find((c) => c.id === "sources-agree")?.passed).toBe(false);
  });

  it("rejects a source served from the wrong domain", () => {
    const [f] = verifyFacts([{ ...base, sources: [{ ...base.sources[0], url: "https://dipres-gob.cl.example.com/x.pdf" }] }]);
    expect(f.status).toBe("pendiente");
  });

  it("needs two independent publishers to corroborate; same-owner outlets don't count twice", () => {
    const press = (publisher: string, url: string) => ({ publisher, title: "t", url, retrievedAt: "2026-10-17", verifiedBy: "manual" as const });
    const two = verifyFacts([{ ...base, id: "a", sources: [press("emol", "https://www.emol.com/a"), press("cnnchile", "https://www.cnnchile.com/b")] }])[0];
    expect(two.status).toBe("corroborado");
    const one = verifyFacts([{ ...base, id: "b", sources: [press("emol", "https://www.emol.com/a")] }])[0];
    expect(one.status).toBe("secundario");
  });

  it("a derived fact inherits the weakest input", () => {
    const weak: FactInput = { ...base, id: "w", sources: [{ publisher: "emol", title: "t", url: "https://www.emol.com/a", retrievedAt: "2026-10-17", verifiedBy: "manual" }] };
    const d: FactInput = { ...base, id: "d", sources: [], derivedFrom: ["t.total", "w"], method: "suma" };
    const out = verifyFacts([base, weak, d]);
    expect(out.find((f) => f.id === "d")!.status).toBe("secundario");
  });

  it("throws on unknown dependencies rather than guessing", () => {
    expect(() => verifyFacts([{ ...base, id: "d", sources: [], derivedFrom: ["nope"] }])).toThrow();
  });
});

describe("budget dataset", () => {
  const ds = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/seed/budget-2027-partidas.json"), "utf8")) as PartidasDataset;

  it("all 32 partidas pass cross-outlet and official spot checks", () => {
    const { facts, extra } = partidaFacts(ds);
    const graded = verifyFacts(facts, extra);
    const failed = graded.flatMap((f) => f.checks.filter((c) => !c.passed).map((c) => `${f.id}:${c.id}`));
    expect(failed).toEqual([]);
    expect(graded.filter((f) => f.id.startsWith("ppto2027.partida.")).length).toBe(32);
  });

  it("detects a tampered amount through the official spot check and the FX cross-check", () => {
    const tampered = structuredClone(ds);
    tampered.partidas.find((p) => p.slug === "congreso")!.milesCLP = 198229031;
    const { facts, extra } = partidaFacts(tampered);
    const f = verifyFacts(facts, extra).find((x) => x.id === "ppto2027.partida.congreso")!;
    expect(f.status).toBe("pendiente");
    expect(f.checks.find((c) => c.id === "official-spot-check")?.passed).toBe(false);
    expect(f.checks.find((c) => c.id === "cross-outlet-fx")?.passed).toBe(false);
  });
});

describe("shipped data", () => {
  it("every required fact is displayable and every check passes", () => {
    const facts = loadFacts({ fresh: true });
    for (const id of REQUIRED_FACTS) expect(facts.find((f) => f.id === id)?.status).not.toBe("pendiente");
    expect(facts.flatMap((f) => f.checks).every((c) => c.passed)).toBe(true);
  });

  it("per-person spending matches a hand calculation", () => {
    const f = loadFacts().find((x) => x.id === "gc.por_persona_dia")!;
    expect(Math.round(f.value as number)).toBe(Math.round((91175816e6 / 20150948) / 365));
  });
});
