import type { Fact } from "./provenance/types";

const nf = (min: number, max: number) => new Intl.NumberFormat("es-CL", { minimumFractionDigits: min, maximumFractionDigits: max });

export function fmtNumber(n: number, decimals = 0): string {
  return nf(decimals, decimals).format(n);
}

export function fmtPct(n: number, signed = false): string {
  const s = nf(1, 1).format(Math.abs(n)).replace(/,0$/, "");
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${signed ? sign : n < 0 ? "−" : ""}${s}%`;
}

/** miles de pesos → "$17,3 billones" / "$632 mil millones" / "$35 mil millones" */
export function fmtBillones(miles: number): string {
  const pesos = miles * 1000;
  if (pesos >= 1e12) return `$${nf(1, 1).format(pesos / 1e12)} billones`;
  if (pesos >= 1e9) return `$${nf(0, 0).format(pesos / 1e9)} mil millones`;
  return `$${nf(0, 0).format(pesos / 1e6)} millones`;
}

export function fmtClp(pesos: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact) return fmtBillones(pesos / 1000);
  return `$${nf(0, 0).format(Math.round(pesos))}`;
}

export function fmtUsdMillones(m: number): string {
  return `US$${nf(0, 0).format(m)} millones`;
}

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function fmtDate(iso: string, opts: { short?: boolean } = {}): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const month = MONTHS[m - 1];
  return opts.short ? `${d} ${month.slice(0, 3)}` : `${d} de ${month} de ${y}`;
}

export function fmtFact(f: Fact): string {
  const v = f.value;
  if (typeof v === "string") return f.unit === "fecha" ? fmtDate(v) : v;
  switch (f.unit) {
    case "CLP":
      return fmtClp(v);
    case "CLP_miles":
      return fmtBillones(v);
    case "CLP_millones":
      return fmtBillones(v * 1000);
    case "USD_millones":
      return fmtUsdMillones(v);
    case "pct":
      return fmtPct(v, true);
    case "pct_pib":
      return `${fmtPct(v)} del PIB`;
    case "personas":
      return `${fmtNumber(v)} personas`;
    case "dias":
      return `${fmtNumber(v)} días`;
    default:
      return fmtNumber(v);
  }
}

export const STATUS_LABEL: Record<string, string> = {
  oficial: "Dato oficial",
  corroborado: "Corroborado",
  secundario: "Una fuente",
  pendiente: "Pendiente",
  ejemplo: "Ejemplo",
};

export const STATUS_HELP: Record<string, string> = {
  oficial: "Leído directamente en el documento o servicio del organismo público, y pasó todas las comprobaciones.",
  corroborado: "Dos medios independientes reportan lo mismo citando la fuente oficial; aún no se lee del documento oficial.",
  secundario: "Viene de una sola fuente no oficial. Úsalo con cautela.",
  pendiente: "No se muestra: falta fuente o falló una comprobación.",
  ejemplo: "Dato ficticio para mostrar cómo se verá esta sección.",
};
