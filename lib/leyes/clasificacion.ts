import fs from "node:fs";
import path from "node:path";
import type { Bill } from "./types";

/**
 * How deep a law goes, and its impact dial. Clear cases are decided by published rules; the rest is an AI draft with
 * its reasons, shown labelled as «borrador IA, pendiente de revisión» until an editor confirms it.
 */
import { PROFUNDIDAD, DIAL, type Profundidad } from "./labels";
export { PROFUNDIDAD, DIAL, type Profundidad };

/** The four parts of the impact dial that can be read today (money waits for the informes financieros). */
export interface PartesImpacto {
  /** Who is affected */
  alcance: "amplio" | "grande" | "acotado" | "local" | "desconocido";
  permanencia: "permanente" | "temporal" | "puntual" | "desconocido";
  /** New rights, benefits, duties or penalties */
  derechos: "crea" | "ajusta" | "ninguno" | "desconocido";
  /** New bodies, powers, or a special quorum */
  instituciones: "crea" | "ajusta" | "ninguna" | "desconocido";
}

export interface Clasificacion {
  profundidad: Profundidad;
  razon: string;
  partes?: PartesImpacto;
  /** "regla" = decided by a published rule; "ia" = AI draft pending review; "editor" = confirmed by an editor */
  por: "regla" | "ia" | "editor";
  regla?: string;
  modelo?: string;
}

const RULES: { id: string; re: RegExp; profundidad: Profundidad; razon: string; partes?: PartesImpacto }[] = [
  {
    id: "dia-o-conmemoracion",
    re: /^(declara|establece|instituye|consagra)\b.*\b(d[ií]a|semana|mes|a[ñn]o)\s+(nacional|internacional|del|de la|de los|de las)\b/i,
    profundidad: "simbolica",
    razon: "Declara un día, semana o año conmemorativo.",
    partes: { alcance: "amplio", permanencia: "permanente", derechos: "ninguno", instituciones: "ninguna" },
  },
  {
    id: "monumento",
    re: /\bautoriza (erigir|la construcci[oó]n de) (un |una )?(monumento|memorial|busto|estatua)/i,
    profundidad: "simbolica",
    razon: "Autoriza un monumento o memorial.",
    partes: { alcance: "local", permanencia: "puntual", derechos: "ninguno", instituciones: "ninguna" },
  },
  {
    id: "nacionalidad-por-gracia",
    re: /\b(otorga|concede),? por (especial )?gracia,? la nacionalidad/i,
    profundidad: "simbolica",
    razon: "Concede la nacionalidad por gracia a una persona.",
    partes: { alcance: "local", permanencia: "permanente", derechos: "ninguno", instituciones: "ninguna" },
  },
  {
    id: "denominacion",
    re: /^(denomina|da el nombre|otorga el nombre|cambia el nombre)\b/i,
    profundidad: "simbolica",
    razon: "Da o cambia el nombre de un lugar, obra o institución.",
    partes: { alcance: "local", permanencia: "permanente", derechos: "ninguno", instituciones: "ninguna" },
  },
  {
    id: "ley-de-presupuestos",
    re: /^ley de presupuestos? (del|para el) sector p[uú]blico/i,
    profundidad: "estructural",
    razon: "Ley de Presupuestos: fija todo el gasto del Estado para un año.",
    partes: { alcance: "amplio", permanencia: "temporal", derechos: "ajusta", instituciones: "ajusta" },
  },
];

/** The published rule that decides a bill's depth, if any. */
export function ruleFor(b: Pick<Bill, "titulo">): Clasificacion | null {
  const t = b.titulo.trim();
  const r = RULES.find((x) => x.re.test(t));
  return r ? { profundidad: r.profundidad, razon: r.razon, partes: r.partes, por: "regla", regla: r.id } : null;
}

export const RULE_LIST = RULES.map((r) => ({ id: r.id, profundidad: r.profundidad, razon: r.razon }));

const SCORE: Record<string, number | null> = {
  amplio: 1, grande: 0.75, acotado: 0.4, local: 0.15,
  permanente: 1, temporal: 0.5, puntual: 0.15,
  crea: 1, ajusta: 0.5, ninguno: 0, ninguna: 0,
  desconocido: null,
};

/**
 * The impact dial, 1–5, from the parts that are known (each 0–1, averaged; depth weighs as one more part).
 * Null when fewer than two parts are known: the dial says so instead of guessing.
 */
export function dial(c: Clasificacion): { nivel: number; label: string; conocidas: number } | null {
  const parts = c.partes ? [SCORE[c.partes.alcance], SCORE[c.partes.permanencia], SCORE[c.partes.derechos], SCORE[c.partes.instituciones]] : [];
  const known = parts.filter((x): x is number => x !== null);
  if (known.length < 2) return null;
  const depth = (PROFUNDIDAD[c.profundidad].nivel - 1) / 3;
  const s = (known.reduce((a, b) => a + b, 0) + depth) / (known.length + 1);
  const nivel = Math.min(5, Math.max(1, Math.round(s * 4) + 1));
  return { nivel, label: DIAL[nivel - 1], conocidas: known.length };
}

let cache: Record<string, Clasificacion> | undefined;
/** AI drafts written by scripts/classify-laws.ts, plus rules applied on the fly. */
export function clasificaciones(): Record<string, Clasificacion> {
  if (cache) return cache;
  const file = path.join(process.cwd(), "data", "store", "leyes-clasificacion.json");
  cache = fs.existsSync(/*turbopackIgnore: true*/ file) ? ((JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ file, "utf8")) as { items: Record<string, Clasificacion> }).items ?? {}) : {};
  return cache;
}

export function clasificacionDe(b: Pick<Bill, "b" | "titulo">): Clasificacion | null {
  return ruleFor(b) ?? clasificaciones()[b.b] ?? null;
}
