import fs from "node:fs";
import path from "node:path";
import { getFact, loadFacts, dataMode } from "../facts";
import { weakest } from "../provenance/verify";
import type { Fact, Status } from "../provenance/types";
import { fmtPct, fmtBillones, fmtClp, fmtUsdMillones } from "../format";

export interface ChainNode {
  source: string;
  label: string;
  detail: string;
  factId?: string;
}

export interface Finding {
  id: string;
  cross: string;
  title: string;
  summary: string;
  status: Status;
  factIds: string[];
  chain: ChainNode[];
  edges: string[];
  alternatives: string[];
  wouldChange: string;
  /** Deterministic rule (reproducible from the facts) or demo fixture. */
  origin: "regla" | "ejemplo";
  mentionsPeople: boolean;
}

function statusOf(ids: string[]): Status {
  return weakest(ids.map((id) => getFact(id).status));
}

type Partida = { slug: string; name: string; short: string; amount: Fact; variation: Fact };

export function partidas(): Partida[] {
  const facts = loadFacts();
  return facts
    .filter((f) => f.id.startsWith("ppto2027.partida."))
    .map((amount) => {
      const slug = amount.id.replace("ppto2027.partida.", "");
      const variation = facts.find((f) => f.id === `ppto2027.var.${slug}`)!;
      return { slug, name: amount.label, short: shortName(amount.label), amount, variation };
    });
}

export function shortName(name: string): string {
  return name
    .replace(/^Ministerio (de la |del |de las |de los |de )?/, "")
    .replace("Secretaría General de Gobierno", "Secretaría Gral. de Gobierno")
    .replace("Secretaría General de la Presidencia", "Segpres")
    .replace("Financiamiento ", "")
    .replace(", Fomento y Turismo", "")
    .replace(", Tecnología, Conocimiento e Innovación", "")
    .replace(" y Previsión Social", " y Previsión")
    .replace(", las Artes y el Patrimonio", "")
    .replace(" y Telecomunicaciones", "")
    .replace(" y la Equidad de Género", " y Equidad de Género")
    .replace("Contraloría General de la República", "Contraloría")
    .replace("Presidencia de la República", "Presidencia");
}

const num = (f: Fact) => f.value as number;

/** Real change in pesos implied by the % change (approximation using the 2027 amount as base). */
function realChangeMiles(p: Partida): number {
  const v = num(p.variation) / 100;
  return num(p.amount) - num(p.amount) / (1 + v);
}

function ruleExtremes(ps: Partida[]): Finding {
  const sorted = [...ps].sort((a, b) => num(b.variation) - num(a.variation));
  const up = sorted.slice(0, 3);
  const down = sorted.slice(-3).reverse();
  const list = (xs: Partida[]) => xs.map((p) => `${p.short} (${fmtPct(num(p.variation), true)})`).join(", ").replace(/, ([^,]*)$/, " y $1");
  const ids = [...up, ...down].flatMap((p) => [p.variation.id, p.amount.id]);
  const biggestUp = up[0];
  return {
    id: "alzas-y-bajas",
    cross: "Presupuesto 2027",
    title: `${list(up)} tienen las mayores alzas reales; ${list(down)}, las mayores bajas.`,
    summary: `Comparación de las 32 partidas del Proyecto 2027 con su base 2026 ajustada. En pesos, el alza de ${biggestUp.short} equivale a unos ${fmtClp(realChangeMiles(biggestUp) * 1000, { compact: true })}, poco frente a partidas grandes.`,
    status: statusOf(ids),
    factIds: ids,
    chain: [
      { source: "DIPRES vía Emol y CNN Chile", label: "32 partidas", detail: "Proyecto 2027 vs base 2026" },
      { source: "Cálculo", label: "Variación real", detail: "Ordenadas de mayor a menor" },
      { source: "Mayor alza", label: biggestUp.short, detail: fmtPct(num(biggestUp.variation), true), factId: biggestUp.variation.id },
      { source: "Mayor baja", label: down[0].short, detail: fmtPct(num(down[0].variation), true), factId: down[0].variation.id },
    ],
    edges: ["se comparan", "extremos", "frente a"],
    alternatives: [
      "Un % alto en una partida pequeña puede ser poco dinero: mira el monto en pesos antes de concluir.",
      "La base 2026 incluye ajustes del año; contra la Ley 2026 original los porcentajes serían distintos.",
    ],
    wouldChange: "Que el Congreso modifique estas partidas durante la tramitación, o que DIPRES corrija la base de comparación.",
    origin: "regla",
    mentionsPeople: false,
  };
}

function ruleLargeCuts(ps: Partida[]): Finding {
  const large = ps.filter((p) => num(p.amount) >= 1e9); // ≥ $1 billón (miles de $)
  const cuts = large.filter((p) => num(p.variation) < 0).sort((a, b) => num(a.variation) - num(b.variation));
  const target = cuts[0] ?? [...large].sort((a, b) => num(a.variation) - num(b.variation))[0];
  const only = cuts.length === 1;
  const ids = [...large.map((p) => p.variation.id), target.amount.id];
  return {
    id: "recorte-partidas-grandes",
    cross: "Presupuesto 2027",
    title: `${target.short} es ${only ? "la única" : "la que más baja entre las"} ${only ? "partida de más de $1 billón que baja" : "partidas de más de $1 billón"}: ${fmtPct(num(target.variation), true)} real.`,
    summary: `De las ${large.length} partidas que superan $1 billón, ${cuts.length === 0 ? "ninguna baja" : cuts.length === 1 ? "solo una baja en términos reales" : `${cuts.length} bajan`}. ${target.short} propone ${fmtBillones(num(target.amount))} para 2027.`,
    status: statusOf(ids),
    factIds: ids,
    chain: [
      { source: "DIPRES vía Emol y CNN Chile", label: `${large.length} partidas grandes`, detail: "Más de $1 billón cada una" },
      { source: "Cálculo", label: "Variación real", detail: `${cuts.length} con baja` },
      { source: "Resultado", label: target.short, detail: `${fmtPct(num(target.variation), true)} · ${fmtBillones(num(target.amount))}`, factId: target.variation.id },
    ],
    edges: ["se filtran por tamaño", "la mayor baja"],
    alternatives: [
      "Parte del financiamiento regional puede venir por otras vías (fondos sectoriales, convenios) que no aparecen en esta partida.",
      "Una baja real puede deberse a menor ejecución esperada y no a un recorte de programas.",
    ],
    wouldChange: "Indicaciones que repongan recursos en la Comisión Mixta, o información de DIPRES sobre transferencias regionales desde otras partidas.",
    origin: "regla",
    mentionsPeople: false,
  };
}

function ruleConcentration(ps: Partida[]): Finding {
  const total = getFact("ppto2027.partidas_total");
  const top = [...ps].sort((a, b) => num(b.amount) - num(a.amount)).slice(0, 3);
  const share = (top.reduce((a, p) => a + num(p.amount), 0) / num(total)) * 100;
  const ids = [total.id, ...top.map((p) => p.amount.id)];
  return {
    id: "concentracion",
    cross: "Presupuesto 2027",
    title: `${top.map((p) => p.short).join(", ").replace(/, ([^,]*)$/, " y $1")} concentran ${fmtPct(share)} del gasto de los ministerios.`,
    summary: `De ${fmtBillones(num(total))} repartidos en 32 partidas (sin Tesoro Público), tres se llevan ${fmtPct(share)}. Por eso cualquier cambio en ellas mueve más plata que eliminar varias partidas pequeñas.`,
    status: statusOf(ids),
    factIds: ids,
    chain: [
      { source: "DIPRES vía Emol y CNN Chile", label: "Gasto de 32 partidas", detail: fmtBillones(num(total)), factId: total.id },
      ...top.map((p) => ({ source: "Partida", label: p.short, detail: fmtBillones(num(p.amount)), factId: p.amount.id })),
    ],
    edges: ["las tres mayores", "", ""],
    alternatives: ["El Tesoro Público (deuda, subsidios) no está en el cuadro: con él, la proporción sería menor."],
    wouldChange: "Incluir la partida Tesoro Público cuando el conector de DIPRES la extraiga.",
    origin: "regla",
    mentionsPeople: false,
  };
}

function ruleDebt(): Finding {
  const a = getFact("deuda.autorizacion_2027");
  const ini = getFact("deuda.limite_inicial_2026");
  const vig = getFact("deuda.limite_vigente_2026");
  const upIni = getFact("deuda.alza_vs_inicial");
  const upVig = getFact("deuda.alza_vs_vigente");
  const ids = [a.id, ini.id, vig.id, upIni.id, upVig.id, "deuda.ampliacion_2026"];
  return {
    id: "techo-deuda",
    cross: "Deuda pública",
    title: `El endeudamiento pedido para 2027 es ${fmtPct(num(upIni))} mayor que el límite inicial de 2026, pero solo ${fmtPct(num(upVig))} mayor que el límite ya ampliado.`,
    summary: `La Ley 2026 partió con ${fmtUsdMillones(num(ini))} y se amplió a ${fmtUsdMillones(num(vig))}. El Proyecto 2027 pide ${fmtUsdMillones(num(a))}. Según con qué se compare, la lectura cambia mucho.`,
    status: statusOf(ids),
    factIds: ids,
    chain: [
      { source: "Ley 2026", label: "Límite inicial", detail: fmtUsdMillones(num(ini)), factId: ini.id },
      { source: "Ley 2026 ampliada", label: "Límite vigente", detail: fmtUsdMillones(num(vig)), factId: vig.id },
      { source: "Proyecto 2027", label: "Nueva solicitud", detail: fmtUsdMillones(num(a)), factId: a.id },
    ],
    edges: ["el Congreso amplía", "el Gobierno pide"],
    alternatives: ["Parte del monto refinancia deuda que vence; no es todo gasto nuevo.", "Las cifras de 2026 vienen de prensa; falta leerlas en la ley publicada."],
    wouldChange: "Leer el artículo 3° del Proyecto 2027 y de la Ley 2026 en el Diario Oficial (pendiente en el conector de BCN).",
    origin: "regla",
    mentionsPeople: false,
  };
}

function demoFindings(): Finding[] {
  if (dataMode() !== "demo") return [];
  const file = path.join(process.cwd(), "data", "demo", "findings.json");
  if (!fs.existsSync(file)) return [];
  return (JSON.parse(fs.readFileSync(file, "utf8")) as Omit<Finding, "status" | "origin">[]).map((f) => ({ ...f, status: "ejemplo" as Status, origin: "ejemplo" as const }));
}

export function allFindings(): Finding[] {
  const ps = partidas();
  const real = [ruleDebt(), ruleExtremes(ps), ruleLargeCuts(ps), ruleConcentration(ps)].filter((f) => f.status !== "pendiente");
  return [...real, ...demoFindings()];
}
