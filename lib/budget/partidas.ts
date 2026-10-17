import { z } from "zod";
import { SourceRef, type CheckResult, type FactInput } from "../provenance/types";
import type { ExtraCheck } from "../provenance/verify";

export const PartidaRow = z.object({
  slug: z.string(),
  name: z.string(),
  short: z.string(),
  milesCLP: z.number().positive(),
  usdMillones: z.number().positive(),
  varPct: z.number(),
});
export type PartidaRow = z.infer<typeof PartidaRow>;

export const PartidasDataset = z.object({
  id: z.string(),
  title: z.string(),
  asOf: z.string(),
  unit: z.literal("CLP_miles"),
  measure: z.string(),
  comparison: z.string(),
  sources: z.record(z.string(), SourceRef),
  officialDocument: z.object({ publisher: z.string(), title: z.string(), url: z.string().url(), note: z.string() }),
  partidas: z.array(PartidaRow),
  officialSpotChecks: z.array(
    z.object({
      slug: z.string(),
      document: SourceRef,
      officialTotalMilesCLP: z.number(),
      excludedSubtitlesMilesCLP: z.number(),
      explanation: z.string(),
    }),
  ),
});
export type PartidasDataset = z.infer<typeof PartidasDataset>;

export const SPOT_CHECK_TOLERANCE = 1e-4; // 0,01%

const fmtMiles = (n: number) => n.toLocaleString("es-CL");
const fmtUsd = (n: number) => n.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Implied CLP per USD for a row. Both outlets copied the same DIPRES table, so this should be constant up to rounding. */
export function impliedFx(r: PartidaRow): number {
  return (r.milesCLP * 1000) / (r.usdMillones * 1e6);
}

/** Turn the partidas dataset into facts plus dataset-specific checks. */
export function partidaFacts(ds: PartidasDataset): { facts: FactInput[]; extra: Record<string, ExtraCheck[]> } {
  const parsed = PartidasDataset.parse(ds);
  const facts: FactInput[] = [];
  const extra: Record<string, ExtraCheck[]> = {};
  const fxMedian = median(parsed.partidas.map(impliedFx));
  const slugs = new Set<string>();

  for (const r of parsed.partidas) {
    if (slugs.has(r.slug)) throw new Error(`Partida duplicada: ${r.slug}`);
    slugs.add(r.slug);
    const amountId = `ppto2027.partida.${r.slug}`;
    const varId = `ppto2027.var.${r.slug}`;
    const pressSources = Object.values(parsed.sources);

    facts.push({
      id: amountId,
      label: r.name,
      definition: parsed.measure,
      value: r.milesCLP,
      unit: "CLP_miles",
      asOf: parsed.asOf,
      domain: "presupuesto",
      sources: pressSources.map((s) =>
        s.publisher === "cnnchile"
          ? { ...s, asPrinted: `US$${fmtUsd(r.usdMillones)} millones` }
          : { ...s, asPrinted: fmtMiles(r.milesCLP), reportedValue: r.milesCLP },
      ),
    });
    facts.push({
      id: varId,
      label: `Variación real de ${r.name}`,
      definition: parsed.comparison,
      value: r.varPct,
      unit: "pct",
      asOf: parsed.asOf,
      domain: "presupuesto",
      sources: pressSources.map((s) => ({ ...s, reportedValue: r.varPct, asPrinted: `${r.varPct.toLocaleString("es-CL", { minimumFractionDigits: 1 })}%` })),
    });

    const checks: ExtraCheck[] = [];
    // Cross-outlet check: CNN prints US$, Emol prints CLP. If both copied the same table the implied FX is constant.
    checks.push((): CheckResult => {
      const fx = impliedFx(r);
      const tolerance = 0.05 / r.usdMillones + 0.002; // rounding to 0,1 US$ millones + 0,2%
      const dev = Math.abs(fx - fxMedian) / fxMedian;
      return {
        id: "cross-outlet-fx",
        description: "Emol (pesos) y CNN Chile (dólares) reportan el mismo monto al mismo tipo de cambio",
        passed: dev <= tolerance,
        detail: `Tipo de cambio implícito ${fx.toFixed(1)} vs mediana ${fxMedian.toFixed(1)} (desvío ${(dev * 100).toFixed(2)}%, tolerancia ${(tolerance * 100).toFixed(2)}%)`,
      };
    });
    const spot = parsed.officialSpotChecks.find((s) => s.slug === r.slug);
    if (spot) {
      checks.push((): CheckResult => {
        const expected = spot.officialTotalMilesCLP - spot.excludedSubtitlesMilesCLP;
        const dev = Math.abs(expected - r.milesCLP) / expected;
        return {
          id: "official-spot-check",
          description: `Coincide con el documento oficial de DIPRES de la partida`,
          passed: dev <= SPOT_CHECK_TOLERANCE,
          detail: `${spot.explanation} Documento: ${spot.document.url}`,
        };
      });
    }
    extra[amountId] = checks;
  }

  // Dataset completeness: the IFP table has 32 partidas besides Tesoro Público.
  const completeness: ExtraCheck = (): CheckResult => ({
    id: "dataset-complete",
    description: "La tabla tiene las 32 partidas esperadas",
    passed: parsed.partidas.length === 32,
    detail: `${parsed.partidas.length} partidas`,
  });
  const ids = parsed.partidas.map((r) => `ppto2027.partida.${r.slug}`);
  const sum = parsed.partidas.reduce((a, r) => a + r.milesCLP, 0);
  facts.push({
    id: "ppto2027.partidas_total",
    label: "Gasto de los ministerios y servicios (32 partidas)",
    definition: "Suma de las 32 partidas del cuadro, sin Tesoro Público (que concentra deuda y subsidios).",
    value: sum,
    unit: "CLP_miles",
    asOf: parsed.asOf,
    domain: "presupuesto",
    sources: [],
    derivedFrom: ids,
    method: "suma de partidas",
  });
  extra["ppto2027.partidas_total"] = [completeness];
  return { facts, extra };
}
