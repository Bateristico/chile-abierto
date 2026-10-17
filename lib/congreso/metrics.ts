import { CODE, partyOn, type Diputado, type Periodo, type Votacion } from "./types";

/**
 * The vote engine. Pure functions over a period's compact roll calls; every measure is defined here once and used by
 * the pipeline, the pages and the tests. Definitions are also printed on /fuentes.
 */

export interface Split {
  favor: number;
  contra: number;
  abst: number;
  noVota: number;
  ausente: number;
}

const empty = (): Split => ({ favor: 0, contra: 0, abst: 0, noVota: 0, ausente: 0 });

export function add(s: Split, code: string) {
  if (code === CODE.FAVOR) s.favor++;
  else if (code === CODE.CONTRA) s.contra++;
  else if (code === CODE.ABST) s.abst++;
  else if (code === CODE.AUSENTE) s.ausente++;
  else s.noVota++;
}

/** Each party's split on one vote, by the party each deputy belonged to on that day. */
export function splitByParty(p: Periodo, v: Votacion, byId?: Map<number, Diputado>): Map<string, Split> {
  const ids = byId ?? new Map(p.diputados.map((d) => [d.id, d]));
  const date = v.f.slice(0, 10);
  const out = new Map<string, Split>();
  for (let i = 0; i < p.orden.length; i++) {
    const code = v.c.charAt(i);
    if (code === CODE.AUSENTE) continue;
    const party = partyOn(ids.get(p.orden[i]), date) ?? "SIN";
    if (!out.has(party)) out.set(party, empty());
    add(out.get(party)!, code);
  }
  return out;
}

/**
 * Agreement index (Hix, Noury & Roland): 1 when every voting member chose the same option, 0 when the party split evenly
 * three ways. Abstentions count as a position. Null when fewer than `min` members voted.
 */
export function agreementIndex(s: Split, min = 3): number | null {
  const n = s.favor + s.contra + s.abst;
  if (n < min) return null;
  const max = Math.max(s.favor, s.contra, s.abst);
  return (max - 0.5 * (n - max)) / n;
}

/** The option most of a group chose ('1', '0', '2'), or null on a tie or with nobody voting. */
export function majorityOf(s: Split): string | null {
  const opts: [string, number][] = [[CODE.FAVOR, s.favor], [CODE.CONTRA, s.contra], [CODE.ABST, s.abst]];
  opts.sort((a, b) => b[1] - a[1]);
  if (!opts[0][1] || opts[0][1] === opts[1][1]) return null;
  return opts[0][0];
}

export const margin = (v: Votacion) => Math.abs(v.si - v.no);
export const isClose = (v: Votacion, max = 5) => margin(v) <= max;
export const isUnanimous = (v: Votacion) => v.si + v.no + v.ab > 0 && (v.no === 0 && v.ab === 0 || v.si === 0 && v.ab === 0);
/** Approved per the published result of the yearly list. */
export const approved = (v: Votacion) => /aprobad/i.test(v.r);

export interface PartyStats {
  alias: string;
  nombre: string;
  /** Deputies whose militancia today (or at the end of the period) is this party */
  escanos: number;
  /** Mean agreement index over votes where at least 3 members voted */
  cohesion: number | null;
  votos: number;
}

export function partyStats(p: Periodo, asOf: string): PartyStats[] {
  const byId = new Map(p.diputados.map((d) => [d.id, d]));
  const sums = new Map<string, { s: number; n: number }>();
  for (const v of p.votaciones) {
    for (const [party, split] of splitByParty(p, v, byId)) {
      const ai = agreementIndex(split);
      if (ai === null) continue;
      const x = sums.get(party) ?? { s: 0, n: 0 };
      x.s += ai;
      x.n++;
      sums.set(party, x);
    }
  }
  const seats = new Map<string, { n: number; nombre: string }>();
  for (const d of p.diputados) {
    const m = d.militancias.find((x) => x.desde <= asOf && asOf <= x.hasta) ?? d.militancias.at(-1);
    if (!m) continue;
    seats.set(m.alias, { n: (seats.get(m.alias)?.n ?? 0) + 1, nombre: m.nombre || m.alias });
  }
  return [...seats.entries()]
    .map(([alias, x]) => ({ alias, nombre: x.nombre, escanos: x.n, cohesion: sums.get(alias) ? sums.get(alias)!.s / sums.get(alias)!.n : null, votos: sums.get(alias)?.n ?? 0 }))
    .sort((a, b) => b.escanos - a.escanos || a.alias.localeCompare(b.alias));
}

export interface DeputyStats {
  id: number;
  registradas: number;
  favor: number;
  contra: number;
  abst: number;
  noVota: number;
  /** Votes where their party (not independents) had a clear majority among the other members and they voted */
  comparables: number;
  conPartido: number;
  /** Votes where they voted and the chamber's result is known */
  conResultado: number;
  ladoGanador: number;
}

export function deputyStats(p: Periodo): DeputyStats[] {
  const byId = new Map(p.diputados.map((d) => [d.id, d]));
  const stats = p.orden.map((id) => ({ id, registradas: 0, favor: 0, contra: 0, abst: 0, noVota: 0, comparables: 0, conPartido: 0, conResultado: 0, ladoGanador: 0 }));
  for (const v of p.votaciones) {
    const date = v.f.slice(0, 10);
    const parties = splitByParty(p, v, byId);
    const win = /aprobad/i.test(v.r) ? CODE.FAVOR : /rechazad/i.test(v.r) ? CODE.CONTRA : null;
    for (let i = 0; i < p.orden.length; i++) {
      const code = v.c.charAt(i);
      if (code === CODE.AUSENTE) continue;
      const s = stats[i];
      s.registradas++;
      if (code === CODE.FAVOR) s.favor++;
      else if (code === CODE.CONTRA) s.contra++;
      else if (code === CODE.ABST) s.abst++;
      else {
        s.noVota++;
        continue;
      }
      if (win) {
        s.conResultado++;
        if (code === win) s.ladoGanador++;
      }
      const party = partyOn(byId.get(p.orden[i]), date);
      if (!party || party === "IND") continue;
      const split = { ...parties.get(party)! };
      // The deputy's own vote is taken out, so the party line is what the others did.
      if (code === CODE.FAVOR) split.favor--;
      else if (code === CODE.CONTRA) split.contra--;
      else split.abst--;
      if (split.favor + split.contra + split.abst < 3) continue;
      const line = majorityOf(split);
      if (!line) continue;
      s.comparables++;
      if (line === code) s.conPartido++;
    }
  }
  return stats;
}

/** Share of votes where the majorities of two parties chose the same option (both with a clear majority). */
export function partyAgreement(p: Periodo, aliases: string[]): { a: string; b: string; share: number; n: number }[] {
  const byId = new Map(p.diputados.map((d) => [d.id, d]));
  const pairs = new Map<string, { same: number; n: number }>();
  for (const v of p.votaciones) {
    const split = splitByParty(p, v, byId);
    const lines = new Map(aliases.map((a) => [a, split.get(a) && agreementIndex(split.get(a)!, 2) !== null ? majorityOf(split.get(a)!) : null]));
    for (let i = 0; i < aliases.length; i++)
      for (let j = i + 1; j < aliases.length; j++) {
        const la = lines.get(aliases[i]);
        const lb = lines.get(aliases[j]);
        if (!la || !lb) continue;
        const k = `${aliases[i]}|${aliases[j]}`;
        const x = pairs.get(k) ?? { same: 0, n: 0 };
        x.n++;
        if (la === lb) x.same++;
        pairs.set(k, x);
      }
  }
  return [...pairs.entries()].map(([k, x]) => {
    const [a, b] = k.split("|");
    return { a, b, share: x.same / x.n, n: x.n };
  });
}
