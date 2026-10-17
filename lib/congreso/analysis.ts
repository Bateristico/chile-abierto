import { CODE, partyOn, type Periodo } from "./types";
import { deputyStats, partyAgreement, partyStats, splitByParty, agreementIndex, isClose } from "./metrics";

/**
 * Period-level analysis published for the Congreso pages: party cohesion (overall and by year), party agreement,
 * per-deputy stats, closest and most distant colleagues, and a two-dimensional map estimated from the votes alone.
 */

const val = (c: string) => (c === CODE.FAVOR ? 1 : c === CODE.CONTRA ? -1 : c === CODE.ABST ? 0 : NaN);

/** Votes that separate deputies: at least 2.5% of those voting on the losing side (W-NOMINATE's usual cut). */
export function contested(p: Periodo) {
  return p.votaciones.filter((v) => {
    const n = v.si + v.no;
    return n > 0 && Math.min(v.si, v.no) / n >= 0.025;
  });
}

/** Top-k principal components of a symmetric matrix by power iteration with deflation (k small, n ≈ 160). */
export function topEigen(K: number[][], k: number, iters = 300): { values: number[]; vectors: number[][] } {
  const n = K.length;
  const M = K.map((r) => r.slice());
  const values: number[] = [];
  const vectors: number[][] = [];
  for (let e = 0; e < k; e++) {
    let v = Array.from({ length: n }, (_, i) => Math.sin(i + 1 + e));
    let lambda = 0;
    for (let it = 0; it < iters; it++) {
      const w = M.map((row) => row.reduce((s, x, j) => s + x * v[j], 0));
      const norm = Math.hypot(...w) || 1;
      v = w.map((x) => x / norm);
      lambda = norm;
    }
    values.push(lambda);
    vectors.push(v);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) M[i][j] -= lambda * v[i] * v[j];
  }
  return { values, vectors };
}

export interface MapPoint {
  id: number;
  x: number;
  y: number;
}

/**
 * Positions estimated from votes alone (principal components of the vote matrix: a favor 1, en contra −1, abstención 0;
 * missing votes take the vote's mean). Deputies who voted in fewer than 20% of contested votes are left out.
 * Orientation: the largest party at the end of the period sits on the positive side of each dimension, so the map is
 * stable from one day to the next. The axes have no built-in meaning such as left or right.
 */
export function politicalMap(p: Periodo, asOf: string): { points: MapPoint[]; varianza: [number, number]; votaciones: number } {
  const votes = contested(p);
  const m = votes.length;
  const rows = p.orden.map((_, i) => votes.map((v) => val(v.c.charAt(i))));
  const keep = rows.map((r) => r.filter((x) => !Number.isNaN(x)).length >= Math.max(10, 0.2 * m));
  const ids = p.orden.filter((_, i) => keep[i]);
  const X = rows.filter((_, i) => keep[i]);
  // Centre each vote (column) and impute missing values with the column mean (= 0 after centring).
  for (let j = 0; j < m; j++) {
    let s = 0;
    let c = 0;
    for (const r of X) if (!Number.isNaN(r[j])) { s += r[j]; c++; }
    const mean = c ? s / c : 0;
    for (const r of X) r[j] = Number.isNaN(r[j]) ? 0 : r[j] - mean;
  }
  const n = X.length;
  const K = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let a = 0; a < n; a++)
    for (let b = a; b < n; b++) {
      let s = 0;
      const ra = X[a];
      const rb = X[b];
      for (let j = 0; j < m; j++) s += ra[j] * rb[j];
      K[a][b] = K[b][a] = s;
    }
  const trace = K.reduce((s, r, i) => s + r[i], 0) || 1;
  const { values, vectors } = topEigen(K, 2);
  const byId = new Map(p.diputados.map((d) => [d.id, d]));
  const largest = partyStats(p, asOf)[0]?.alias;
  const raw = vectors.map((vec, e) => {
    const coords = vec.map((x) => x * Math.sqrt(values[e]));
    const own = ids.map((id, i) => (partyOn(byId.get(id), asOf) === largest ? coords[i] : NaN)).filter((x) => !Number.isNaN(x));
    const sign = own.length && own.reduce((a, b) => a + b, 0) < 0 ? -1 : 1;
    return coords.map((x) => sign * x);
  });
  // One scale for both axes, so distances on the map keep their proportions.
  const scale = Math.max(...raw.flat().map(Math.abs)) || 1;
  const dims = raw.map((c) => c.map((x) => x / scale));
  return {
    points: ids.map((id, i) => ({ id, x: Math.round(dims[0][i] * 1000) / 1000, y: Math.round(dims[1][i] * 1000) / 1000 })),
    varianza: [values[0] / trace, values[1] / trace],
    votaciones: m,
  };
}

/** Share of votes where two deputies, both voting, chose the same option; top and bottom matches per deputy. */
export function colleagues(p: Periodo, min = 100, k = 5) {
  const n = p.orden.length;
  const same = Array.from({ length: n }, () => new Uint32Array(n));
  const both = Array.from({ length: n }, () => new Uint32Array(n));
  for (const v of p.votaciones) {
    const voted: [number, string][] = [];
    for (let i = 0; i < n; i++) {
      const c = v.c.charAt(i);
      if (c === CODE.FAVOR || c === CODE.CONTRA || c === CODE.ABST) voted.push([i, c]);
    }
    for (let a = 0; a < voted.length; a++)
      for (let b = a + 1; b < voted.length; b++) {
        const [i, ci] = voted[a];
        const [j, cj] = voted[b];
        both[i][j]++;
        if (ci === cj) same[i][j]++;
      }
  }
  return p.orden.map((id, i) => {
    const list: { id: number; share: number; n: number }[] = [];
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const nb = i < j ? both[i][j] : both[j][i];
      if (nb < min) continue;
      const sm = i < j ? same[i][j] : same[j][i];
      list.push({ id: p.orden[j], share: Math.round((sm / nb) * 1000) / 1000, n: nb });
    }
    list.sort((a, b) => b.share - a.share);
    return { id, cercanos: list.slice(0, k), lejanos: list.slice(-k).reverse() };
  });
}

/** Mean agreement index per party and year. */
export function cohesionByYear(p: Periodo) {
  const byId = new Map(p.diputados.map((d) => [d.id, d]));
  const acc = new Map<string, Map<string, { s: number; n: number }>>();
  for (const v of p.votaciones) {
    const y = v.f.slice(0, 4);
    for (const [party, split] of splitByParty(p, v, byId)) {
      const ai = agreementIndex(split);
      if (ai === null) continue;
      if (!acc.has(party)) acc.set(party, new Map());
      const x = acc.get(party)!.get(y) ?? { s: 0, n: 0 };
      x.s += ai;
      x.n++;
      acc.get(party)!.set(y, x);
    }
  }
  return Object.fromEntries([...acc.entries()].map(([party, years]) => [party, Object.fromEntries([...years.entries()].map(([y, x]) => [y, { cohesion: Math.round((x.s / x.n) * 1000) / 1000, votos: x.n }]))]));
}

export function analyse(p: Periodo) {
  const today = new Date().toISOString().slice(0, 10);
  const asOf = p.fin < today ? p.fin : today;
  const partidos = partyStats(p, asOf);
  const grandes = partidos.filter((x) => x.escanos >= 3).map((x) => x.alias);
  return {
    periodo: p.id,
    asOf,
    votaciones: p.votaciones.length,
    ajustadas: p.votaciones.filter((v) => isClose(v)).length,
    partidos: partidos.map((x) => ({ ...x, cohesion: x.cohesion === null ? null : Math.round(x.cohesion * 1000) / 1000 })),
    cohesionAnual: cohesionByYear(p),
    acuerdo: partyAgreement(p, grandes).map((x) => ({ ...x, share: Math.round(x.share * 1000) / 1000 })),
    diputados: deputyStats(p),
    mapa: politicalMap(p, asOf),
    colegas: colleagues(p),
  };
}
export type Analysis = ReturnType<typeof analyse>;
