import fs from "node:fs";
import path from "node:path";
import { daysToLaw, median, type Bill, type BillStatus, type LeyesData } from "./types";
import { clasificacionDe, dial, PROFUNDIDAD, type Profundidad } from "./clasificacion";
import { GOBIERNO_ACTUAL, type Gobierno } from "./gobiernos";
import type { Periodo } from "../congreso/types";

let cache: LeyesData | null | undefined;
/** Bills published by the «leyes» connector; null until it has run. */
export function leyesData(): LeyesData | null {
  if (cache !== undefined) return cache;
  const file = path.join(process.cwd(), "data", "store", "leyes.records.json");
  cache = fs.existsSync(/*turbopackIgnore: true*/ file) ? ((JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ file, "utf8")) as { leyes: LeyesData[] }).leyes[0] ?? null) : null;
  return cache;
}

export function billByBoletin(b: string): Bill | undefined {
  return leyesData()?.bills.find((x) => x.b === b);
}

/** Bills that get their own page: laws published in scope, the current government's bills, and bills voted this term. */
export function billsWithPage(votedThisTerm: Set<string> = new Set()): Bill[] {
  const d = leyesData();
  if (!d) return [];
  return d.bills.filter((b) => (b.st === "ley" && (b.publicada ?? "") >= d.desde) || (b.iniciativa === "Mensaje" && b.ingreso >= GOBIERNO_ACTUAL.desde) || votedThisTerm.has(b.b));
}

/** Readings on a fixed scale against the distribution of peers: below the 25th percentile, above the 75th, or in between. */
export function quartiles(xs: number[]): { p25: number; p50: number; p75: number } | null {
  if (xs.length < 8) return null;
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => {
    const i = (s.length - 1) * p;
    const lo = Math.floor(i);
    return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo);
  };
  return { p25: q(0.25), p50: q(0.5), p75: q(0.75) };
}
export function reading(x: number, q: { p25: number; p75: number } | null, labels: [string, string, string]): string | null {
  if (!q) return null;
  return x < q.p25 ? labels[0] : x > q.p75 ? labels[2] : labels[1];
}

// ---------- Authorship (effectiveness) ----------

export interface Autoria {
  presentados: number;
  ley: number;
  tramite: number;
  archivado: number;
  otros: number;
}
const emptyAutoria = (): Autoria => ({ presentados: 0, ley: 0, tramite: 0, archivado: 0, otros: 0 });
function addTo(a: Autoria, st: BillStatus) {
  a.presentados++;
  if (st === "ley") a.ley++;
  else if (st === "tramite") a.tramite++;
  else if (st === "archivado") a.archivado++;
  else a.otros++;
}

/** Mociones each deputy co-authored in a period, and what became of them. Bills are shared: each author counts it. */
export function autoriaPorDiputado(p: Pick<Periodo, "inicio" | "fin" | "orden">): Map<number, Autoria> {
  const out = new Map<number, Autoria>(p.orden.map((id) => [id, emptyAutoria()]));
  for (const b of leyesData()?.bills ?? []) {
    if (!b.iniciativa.startsWith("Moci") || b.ingreso < p.inicio || b.ingreso > p.fin) continue;
    for (const id of b.autores) {
      const a = out.get(id);
      if (a) addTo(a, b.st);
    }
  }
  return out;
}

/** Chamber-wide reference for a period: how many bills deputies author and what share becomes law. */
export function referenciaAutoria(m: Map<number, Autoria>) {
  const rows = [...m.values()].filter((a) => a.presentados >= 5);
  return {
    presentados: quartiles([...m.values()].map((a) => a.presentados)),
    tasa: quartiles(rows.map((a) => a.ley / a.presentados)),
    diputadosConCinco: rows.length,
  };
}

// ---------- Government ----------

export function agendaGobierno(g: Gobierno = GOBIERNO_ACTUAL) {
  const bills = (leyesData()?.bills ?? []).filter((b) => b.iniciativa === "Mensaje" && b.ingreso >= g.desde && b.ingreso <= g.hasta);
  const by = (st: BillStatus) => bills.filter((b) => b.st === st).length;
  const urg = bills.flatMap((b) => b.urgencias.filter((u) => u.desde >= g.desde).map((u) => ({ ...u, b: b.b })));
  const tipos: Record<string, number> = {};
  for (const u of urg) tipos[u.tipo] = (tipos[u.tipo] ?? 0) + 1;
  const conUrgencia = new Set(urg.map((u) => u.b)).size;
  const dias = bills.map(daysToLaw).filter((x): x is number => x !== null);
  return {
    gobierno: g,
    bills,
    total: bills.length,
    ley: by("ley"),
    tramite: by("tramite"),
    archivado: by("archivado"),
    retirado: by("retirado"),
    rechazado: by("rechazado"),
    urgencias: urg.length,
    urgenciasPorTipo: tipos,
    conUrgencia,
    /** Urgencies per bill that had one: governments renew urgencies they cannot get voted in time */
    renovacionesPromedio: conUrgencia ? urg.length / conUrgencia : 0,
    medianaDias: median(dias),
  };
}

// ---------- Speed ----------

/** Days to law, read against laws of the same depth published since the start of the series. */
export function velocidad() {
  const d = leyesData();
  const laws = (d?.bills ?? []).filter((b) => b.st === "ley" && (b.publicada ?? "") >= (d?.desde ?? ""));
  const byDepth = new Map<Profundidad | "sin", number[]>();
  for (const b of laws) {
    const days = daysToLaw(b);
    if (days === null) continue;
    const k = clasificacionDe(b)?.profundidad ?? "sin";
    byDepth.set(k, [...(byDepth.get(k) ?? []), days]);
  }
  const q = new Map([...byDepth.entries()].map(([k, xs]) => [k, quartiles(xs)]));
  return {
    laws,
    q,
    leer(b: Bill): string | null {
      const days = daysToLaw(b);
      if (days === null) return null;
      const k = clasificacionDe(b)?.profundidad ?? "sin";
      return reading(days, q.get(k) ?? null, ["Rápida", "Típica", "Lenta"]);
    },
  };
}

// ---------- Rows for the browser explorer ----------

export function clientRows(pages: Set<string>) {
  const d = leyesData();
  const v = velocidad();
  return (d?.bills ?? []).map((b) => {
    const c = clasificacionDe(b);
    const di = c ? dial(c) : null;
    return {
      b: b.b,
      t: b.titulo,
      i: b.iniciativa.startsWith("Mens") ? "M" : "m",
      o: b.origen,
      f: b.ingreso,
      st: b.st,
      ley: b.ley ?? null,
      pub: b.publicada ?? null,
      d: daysToLaw(b),
      et: b.etapa,
      u: b.st === "tramite" && b.urgenciaActual && !/sin urgencia/i.test(b.urgenciaActual) ? b.urgenciaActual : null,
      p: c?.profundidad ?? null,
      por: c?.por ?? null,
      dial: di?.nivel ?? null,
      a: b.autores.length,
      v: v.leer(b),
      pg: pages.has(b.b),
    };
  });
}
export type ClientRow = ReturnType<typeof clientRows>[number];

export { PROFUNDIDAD };

import { congresoData } from "../congreso/load";
/** Boletines that get a page: see billsWithPage (bills voted in the current term included). */
export function pageBoletines(): Set<string> {
  const cong = congresoData();
  const current = [...(cong?.periodos ?? [])].sort((a, b) => b.id - a.id)[0];
  const voted = new Set((current?.votaciones ?? []).map((v) => v.b).filter(Boolean) as string[]);
  return new Set(billsWithPage(voted).map((b) => b.b));
}
