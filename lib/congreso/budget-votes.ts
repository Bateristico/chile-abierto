import { splitByParty, add, type Split } from "./metrics";
import type { CongresoData, Periodo, Votacion } from "./types";

/** Partidas of the Ley de Presupuestos by number, as the Cámara's indicaciones cite them («Part 16 - Cap 01…»). */
export const PARTIDAS: Record<number, string> = {
  1: "Presidencia", 2: "Congreso", 3: "Poder Judicial", 4: "Contraloría", 5: "Interior", 6: "Relaciones Exteriores", 7: "Economía",
  8: "Hacienda", 9: "Educación", 10: "Justicia", 11: "Defensa", 12: "Obras Públicas", 13: "Agricultura", 14: "Bienes Nacionales",
  15: "Trabajo", 16: "Salud", 17: "Minería", 18: "Vivienda", 19: "Transportes", 20: "Segegob", 21: "Desarrollo Social", 22: "Segpres",
  23: "Ministerio Público", 24: "Energía", 25: "Medio Ambiente", 26: "Deporte", 27: "Mujer", 28: "Servel", 29: "Culturas", 30: "Ciencia",
  31: "Gobiernos Regionales", 32: "Seguridad Pública", 50: "Tesoro Público",
};

/** Partida number cited in a budget vote's text, or null for the general vote and the articles. */
export function partidaOf(text: string | undefined): number | null {
  if (!text) return null;
  const m = text.match(/\bPart(?:ida)?\.?\s*(?:N[°º]\s*)?0*(\d{1,2})\b/i);
  return m ? Number(m[1]) : null;
}

/** Who proposed the indicación, from the vote text («del Ejecutivo», «del diputado X»). */
export function proponente(text: string | undefined): string | null {
  if (!text) return null;
  if (/^del Ejecutivo/i.test(text)) return "Ejecutivo";
  const m = text.match(/^de(?:l| la) diputad[oa] ([^\n]+?)(?:\s{2,}|\s+Part|\s+Art|$)/i);
  if (m) return m[1].trim();
  if (/Senado/i.test(text)) return "Senado";
  if (/Comisi[oó]n Mixta/i.test(text)) return "Comisión Mixta";
  return null;
}

export interface BudgetRow {
  key: string;
  partida: number | null;
  nombre: string;
  votos: Votacion[];
  porPartido: Record<string, Split>;
}

export interface BudgetGrid {
  boletin: string;
  anio: number;
  periodo: string;
  votaciones: number;
  partidos: string[];
  filas: BudgetRow[];
}

/** How each party voted a budget bill, partida by partida, in the Cámara. */
export function budgetGrid(data: CongresoData, boletin: string, anio: number, minSeats = 3): BudgetGrid | null {
  let periodo: Periodo | undefined;
  let votes: Votacion[] = [];
  for (const p of data.periodos) {
    const vs = p.votaciones.filter((v) => v.b === boletin);
    if (vs.length) {
      periodo = p;
      votes = vs;
    }
  }
  if (!periodo || !votes.length) return null;
  const byId = new Map(periodo.diputados.map((d) => [d.id, d]));
  const rows = new Map<string, BudgetRow>();
  const totals = new Map<string, number>();
  for (const v of votes.sort((a, b) => a.f.localeCompare(b.f))) {
    const n = partidaOf(v.art);
    const key = n === null ? "general" : `p${n}`;
    if (!rows.has(key)) rows.set(key, { key, partida: n, nombre: n === null ? "Idea de legislar, articulado y trámites" : PARTIDAS[n] ?? `Partida ${n}`, votos: [], porPartido: {} });
    const row = rows.get(key)!;
    row.votos.push(v);
    for (const [party, s] of splitByParty(periodo, v, byId)) {
      const acc = row.porPartido[party] ?? { favor: 0, contra: 0, abst: 0, noVota: 0, ausente: 0 };
      acc.favor += s.favor;
      acc.contra += s.contra;
      acc.abst += s.abst;
      acc.noVota += s.noVota;
      row.porPartido[party] = acc;
      totals.set(party, Math.max(totals.get(party) ?? 0, s.favor + s.contra + s.abst + s.noVota));
    }
  }
  const partidos = [...totals.entries()].filter(([, n]) => n >= minSeats).sort((a, b) => b[1] - a[1]).map(([a]) => a);
  const filas = [...rows.values()].sort((a, b) => (a.partida ?? -1) - (b.partida ?? -1));
  return { boletin, anio, periodo: periodo.nombre, votaciones: votes.length, partidos, filas };
}

/** Support among those who voted: a favor ÷ (a favor + en contra + abstención). */
export const support = (s: Split | undefined) => {
  if (!s) return null;
  const n = s.favor + s.contra + s.abst;
  return n ? s.favor / n : null;
};

export { add };
