import fs from "node:fs";
import path from "node:path";
import { factsByPrefix, maybeFact } from "./facts";
import type { Fact } from "./provenance/types";

const SEAT_COLORS = ["#3B3486", "#E0584E", "#2E8A7A", "#D9A12B", "#8C83D9", "#5B9BD5", "#B5567A", "#7A8B3A"];
const OTHER = "#C9CAD3";

export interface Composition {
  total: Fact;
  women?: Fact;
  votaciones?: Fact;
  cuadradas?: Fact;
  parties: { key: string; label: string; alias: string; n: number; color: string; fact?: Fact }[];
}

/** Cámara composition from the ingested official facts; null until the camara connector has published. */
export function camaraComposition(): Composition | null {
  const total = maybeFact("camara.diputados_en_ejercicio");
  const partyFacts = factsByPrefix("camara.partido.").filter((f) => f.status !== "pendiente");
  if (!total || !partyFacts.length) return null;
  const sorted = partyFacts
    .map((f) => ({ f, alias: (f.label.match(/\(([^)]+)\)\s*$/)?.[1] ?? f.id.split(".").pop()!).toUpperCase(), name: f.label.replace(/^Diputados de /, "").replace(/\s*\([^)]+\)\s*$/, "") }))
    .sort((a, b) => (b.f.value as number) - (a.f.value as number));
  const top = sorted.slice(0, SEAT_COLORS.length);
  const rest = sorted.slice(SEAT_COLORS.length);
  const parties: Composition["parties"] = top.map((p, i) => ({ key: p.f.id, label: p.name, alias: p.alias, n: p.f.value as number, color: SEAT_COLORS[i], fact: p.f }));
  const restN = rest.reduce((a, p) => a + (p.f.value as number), 0);
  if (restN) parties.push({ key: "otros", label: `Otros ${rest.length} partidos (${rest.map((r) => r.alias).join(", ")})`, alias: "Otros", n: restN, color: OTHER });
  const latest = (prefix: string) => factsByPrefix(prefix).filter((f) => f.status !== "pendiente").sort((a, b) => b.id.localeCompare(a.id))[0];
  return { total, women: maybeFact("camara.diputadas"), votaciones: latest("camara.votaciones_2"), cuadradas: latest("camara.votaciones_cuadradas_"), parties };
}

export interface Programa {
  candidatura: string;
  slug: string;
  url: string;
  extracted?: { accepted: number; rejected: number };
}

/** Presidential programs filed with the Servel, with extraction results when available. */
export function programas(): { eleccion: string; retrievedAt: string; items: Programa[] } {
  const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "seed", "programas-2025.json"), "utf8")) as { eleccion: string; retrievedAt: string; programas: Programa[] };
  const dir = path.join(process.cwd(), "data", "store", "promises");
  const items = raw.programas.map((p) => {
    const file = path.join(dir, `${p.slug}.json`);
    if (!fs.existsSync(/*turbopackIgnore: true*/ file)) return p;
    const r = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ file, "utf8")) as { accepted: unknown[]; rejected: unknown[] };
    return { ...p, extracted: { accepted: r.accepted.length, rejected: r.rejected.length } };
  });
  return { eleccion: raw.eleccion, retrievedAt: raw.retrievedAt, items };
}
