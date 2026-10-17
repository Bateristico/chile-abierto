import type { Unit } from "./types";

/**
 * Parse a number as printed in Chilean Spanish sources into the fact's unit.
 * "$91.175.816 millones" → 91175816 (CLP_millones); "US$25 mil millones" → 25000 (USD_millones);
 * "-1,8% del PIB" → -1.8; "20.150.948" → 20150948. Returns null when it can't parse with confidence.
 */
export function parsePrinted(asPrinted: string, unit: Unit): number | null {
  const text = asPrinted.toLowerCase().replace(/ /g, " ").replace(/−/g, "-");
  // Never compare across currencies: a figure printed in dollars says nothing about a peso value.
  const currency = /us\$|d[óo]lares|usd/.test(text) ? "USD" : /\$|pesos/.test(text) ? "CLP" : null;
  if (currency === "USD" && unit.startsWith("CLP")) return null;
  if (currency === "CLP" && unit.startsWith("USD")) return null;
  const m = text.match(/-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d+(?:,\d+)?/);
  if (!m) return null;
  let n = Number(m[0].replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  const after = text.slice((m.index ?? 0) + m[0].length);

  const scale = (() => {
    if (/^\s*mil\s+millones/.test(after)) return 1e9;
    if (/^\s*billones?/.test(after)) return 1e12;
    if (/^\s*millones?/.test(after)) return 1e6;
    if (/^\s*mil\b/.test(after)) return 1e3;
    return 1;
  })();
  const unitScale: Partial<Record<Unit, number>> = { CLP_millones: 1e6, USD_millones: 1e6, CLP_miles: 1e3 };
  if (unitScale[unit] && scale !== 1) n = (n * scale) / unitScale[unit]!;
  return n;
}
