import type { Fact } from "../provenance/types";

/** Numbers as written in a Spanish answer: "91.175.816", "1,5", "-11,9", "12.396". Years and citation ids are ignored. */
export function numbersIn(text: string): number[] {
  const withoutCitations = text.replace(/\[[^\]]+\]/g, " ");
  const out: number[] = [];
  for (const m of withoutCitations.matchAll(/(?<![\w.,])[-−]?\d{1,3}(?:\.\d{3})+(?:,\d+)?|(?<![\w.,])[-−]?\d+(?:,\d+)?/g)) {
    const n = Number(m[0].replace(/−/g, "-").replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(n)) continue;
    if (Number.isInteger(n) && n >= 1900 && n <= 2100) continue; // years
    if (Number.isInteger(n) && Math.abs(n) <= 10) continue; // small counts ("tres", "2 fuentes")
    out.push(n);
  }
  return out;
}

/** Every way a fact's value could legitimately be written: raw, rescaled to other units, rounded. */
export function allowedValues(facts: Fact[]): number[] {
  const vals: number[] = [];
  for (const f of facts) {
    if (typeof f.value !== "number") continue;
    const v = f.value;
    const scaled = [v, Math.abs(v)];
    if (f.unit === "CLP_miles") scaled.push(v / 1e3, v / 1e6, v / 1e9); // millones, miles de millones, billones
    if (f.unit === "CLP_millones") scaled.push(v / 1e3, v / 1e6);
    if (f.unit === "USD_millones") scaled.push(v / 1e3);
    if (f.unit === "personas") scaled.push(v / 1e6);
    for (const s of scaled) vals.push(s, Math.round(s), Math.round(s * 10) / 10, Math.round(s * 100) / 100);
  }
  return vals;
}

export interface GroundingResult {
  grounded: boolean;
  unsupported: number[];
}

/** Every number in the answer must match a value of a fact the agent actually retrieved. */
export function checkGrounding(answer: string, retrieved: Fact[]): GroundingResult {
  const allowed = allowedValues(retrieved);
  const unsupported = numbersIn(answer).filter(
    (n) => !allowed.some((a) => Math.abs(a - n) <= Math.max(1e-9, Math.abs(a) * 5e-4) || Math.abs(Math.abs(a) - Math.abs(n)) < 1e-9),
  );
  return { grounded: unsupported.length === 0, unsupported: [...new Set(unsupported)] };
}
