/**
 * Compact model of the Cámara's roll calls, shared by the connector, the metrics and the explorers.
 * One string per vote holds every deputy's option, aligned with the period's deputy order:
 *   '1' a favor · '0' en contra · '2' abstención · '4' no vota · other digit = another official code · '.' not in the detail
 */
export const CODE = { FAVOR: "1", CONTRA: "0", ABST: "2", NO_VOTA: "4", AUSENTE: "." } as const;

export interface Militancia {
  desde: string;
  hasta: string;
  alias: string;
  nombre: string;
}

export interface Diputado {
  id: number;
  nombre: string;
  sexo: string;
  militancias: Militancia[];
}

export interface Votacion {
  id: number;
  /** ISO date-time */
  f: string;
  /** Bill number, when the vote is on a bill */
  b?: string;
  /** Official description (e.g. "Boletín N° 17581-14") */
  d: string;
  si: number;
  no: number;
  ab: number;
  /** Quorum and result as published in the yearly list (the by-bill service mislabels rejections as «Unánime»). */
  q: string;
  r: string;
  /** Kind of matter from the yearly list (Proyecto de Ley, Proyecto de Resolución, Otros…) */
  k?: string;
  /** From the bill's vote list: kind of vote (General, Particular, Única…), the article or indicación, the stage. */
  tipo?: string;
  art?: string;
  tram?: string;
  /** Every deputy's option, aligned with Periodo.orden */
  c: string;
}

export interface Proyecto {
  nombre: string;
  iniciativa: string;
  materias: string[];
}

export interface Periodo {
  id: number;
  nombre: string;
  inicio: string;
  fin: string;
  diputados: Diputado[];
  /** Deputy ids in the order used by Votacion.c */
  orden: number[];
  votaciones: Votacion[];
  cuarentena: number[];
}

export interface CongresoData {
  generadoEl: string;
  periodos: Periodo[];
  proyectos: Record<string, Proyecto>;
}

/** Party alias of a deputy on a date (YYYY-MM-DD). */
export function partyOn(d: Diputado | undefined, date: string): string | null {
  if (!d) return null;
  return d.militancias.find((m) => m.desde <= date && date <= m.hasta)?.alias ?? d.militancias.at(-1)?.alias ?? null;
}

export function boletinOf(descripcion: string): string | undefined {
  return descripcion.match(/(\d{3,5}-\d{2})/)?.[1];
}

/** A readable title for votes without a bill: «5-Cambio de Trámite» → «Cambio de trámite». */
export function voteTitle(v: { d: string; k?: string }): string {
  const t = v.d.replace(/^\d+\s*-\s*/, "").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase().replace(/n° /g, "N° ") : v.k ?? "Votación";
}
