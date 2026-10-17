import fs from "node:fs";
import path from "node:path";
import type { CongresoData, Periodo } from "./types";

let cache: CongresoData | null | undefined;

/** All roll calls published by the «congreso» connector; null until it has run. */
export function congresoData(): CongresoData | null {
  if (cache !== undefined) return cache;
  const file = path.join(process.cwd(), "data", "store", "congreso.records.json");
  cache = fs.existsSync(/*turbopackIgnore: true*/ file) ? ((JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ file, "utf8")) as { congreso: CongresoData[] }).congreso[0] ?? null) : null;
  return cache;
}

/** What the browser explorers load for one period: deputies, votes and the bills they cite. */
export function clientPeriod(data: CongresoData, p: Periodo) {
  const bills = new Set(p.votaciones.map((v) => v.b).filter(Boolean) as string[]);
  return {
    id: p.id,
    nombre: p.nombre,
    inicio: p.inicio,
    fin: p.fin,
    generadoEl: data.generadoEl,
    diputados: p.diputados.map((d) => ({ id: d.id, n: d.nombre, s: d.sexo.charAt(0), m: d.militancias.map((m) => [m.desde, m.hasta, m.alias]) })),
    partidos: Object.fromEntries(p.diputados.flatMap((d) => d.militancias.map((m) => [m.alias, m.nombre || m.alias]))),
    orden: p.orden,
    votaciones: p.votaciones,
    proyectos: Object.fromEntries([...bills].filter((b) => data.proyectos[b]).map((b) => [b, data.proyectos[b]])),
  };
}
export type ClientPeriod = ReturnType<typeof clientPeriod>;

import { analyse, type Analysis } from "./analysis";
const analyses = new Map<number, Analysis>();
/** Analysis of one period, computed once per build. */
export function analysisFor(periodId: number): Analysis | null {
  const data = congresoData();
  const p = data?.periodos.find((x) => x.id === periodId);
  if (!p) return null;
  if (!analyses.has(periodId)) analyses.set(periodId, analyse(p));
  return analyses.get(periodId)!;
}
