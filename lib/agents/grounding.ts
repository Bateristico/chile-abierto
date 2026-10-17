import type { Fact } from "../provenance/types";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DATE_ES = new RegExp(`\\b(\\d{1,2})\\s+de\\s+(${MESES.join("|")})\\b`, "gi");

/** Dates written in Spanish ("29 de noviembre") as "MM-DD". */
export function datesIn(text: string): string[] {
  return [...text.matchAll(DATE_ES)].map((m) => `${String(MESES.indexOf(m[2].toLowerCase()) + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`);
}

/** Dates a fact carries anywhere in its record (value, as-of, label, definition), as "MM-DD". */
function factDates(f: Fact): Set<string> {
  const s = JSON.stringify(f);
  const out = new Set<string>(datesIn(s));
  for (const m of s.matchAll(/\b\d{4}-(\d{2})-(\d{2})\b/g)) out.add(`${m[1]}-${m[2]}`);
  return out;
}

/** Numbers as written in a Spanish answer: "91.175.816", "1,5", "-11,9", "12.396". Years, citation ids and day numbers of dates are ignored. */
export function numbersIn(text: string): number[] {
  const withoutCitations = text.replace(/\[[^\]]+\]/g, " ").replace(DATE_ES, " ");
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

/** Constants a reader can check without a source: days in a year, months, per hundred / thousand. */
const CONSTANTS = [12, 100, 365, 366, 1000];

/**
 * Simple arithmetic the gate recomputes itself from the cited facts, in each fact's own scales: sums of two or three
 * values, differences, and ratios as a percentage or a percentage change. A number that matches one of these when
 * rounded the way it is written passes; anything else still fails.
 */
export function derivedValues(facts: Fact[]): number[] {
  const scales: number[][] = [];
  for (const f of facts) {
    if (typeof f.value !== "number") continue;
    const v = f.value;
    const sc = [v];
    if (f.unit === "CLP_miles") sc.push(v / 1e3, v / 1e6, v / 1e9);
    if (f.unit === "CLP_millones") sc.push(v / 1e3, v / 1e6);
    if (f.unit === "USD_millones") sc.push(v / 1e3);
    if (f.unit === "personas") sc.push(v / 1e6);
    scales.push(sc);
  }
  const out: number[] = [];
  for (let i = 0; i < scales.length; i++)
    for (let j = 0; j < scales.length; j++) {
      if (i === j) continue;
      for (let s = 0; s < scales[i].length; s++) {
        const a = scales[i][s];
        const b = scales[j][s] ?? scales[j][0];
        if (i < j) out.push(a + b);
        out.push(a - b);
        if (b !== 0) out.push((a / b) * 100, (a / b - 1) * 100);
        if (i < j) for (let k = j + 1; k < scales.length; k++) out.push(a + b + (scales[k][s] ?? scales[k][0]));
      }
    }
  return out;
}

const roundsTo = (d: number, n: number) => [0, 1, 2].some((p) => Math.abs(Math.round(Math.abs(d) * 10 ** p) / 10 ** p - Math.abs(n)) < 1e-9);

export interface GroundingResult {
  grounded: boolean;
  unsupported: number[];
  /** Dates ("MM-DD") written in the answer that none of the cited facts carries. */
  unsupportedDates?: string[];
}

/**
 * Every number in the answer must match a value of a fact the agent actually retrieved, or simple arithmetic on those
 * values recomputed here; every date must appear in one of those facts.
 */
export function checkGrounding(answer: string, retrieved: Fact[]): GroundingResult {
  const allowed = allowedValues(retrieved);
  let derived: number[] | null = null;
  const unsupported = numbersIn(answer).filter((n) => {
    if (allowed.some((a) => Math.abs(a - n) <= Math.max(1e-9, Math.abs(a) * 5e-4) || Math.abs(Math.abs(a) - Math.abs(n)) < 1e-9)) return false;
    if (CONSTANTS.includes(Math.abs(n))) return false;
    derived ??= derivedValues(retrieved);
    return !derived.some((d) => roundsTo(d, n));
  });
  const known = new Set(retrieved.flatMap((f) => [...factDates(f)]));
  const unsupportedDates = [...new Set(datesIn(answer).filter((d) => !known.has(d)))];
  return { grounded: unsupported.length === 0 && unsupportedDates.length === 0, unsupported: [...new Set(unsupported)], unsupportedDates };
}
