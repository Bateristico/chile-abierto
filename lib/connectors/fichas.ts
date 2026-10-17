import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { fetchImmutable, fetchSnapshot, pool, type Snapshot } from "./http";
import { pdfPages } from "./pdf";
import { CAMARA_ENDPOINTS, collectAll, findArray, parseOpcion, parseXml, reconcileVotes, VotacionSchema, OPCION, voteDeputyId } from "./camara";
import { checkQuote } from "../promises/validate";
import type { Connector, ConnectorResult } from "./types";
import type { FactInput, SourceRef } from "../provenance/types";

/**
 * Fichas: one legislator's full voting record for a term, set against verbatim quotes from the program they ran on.
 * Configured in data/seed/fichas/<slug>.json. Everything comes from official services:
 *  - the Cámara's open data (every Sala vote of the term, reconciled against its published totals),
 *  - the program PDF published by the Servel (each quote must appear verbatim, or nothing is published).
 * Past votes never change, so they are cached between runs (fetchImmutable).
 */

const BASE = process.env.CAMARA_WS_BASE ?? "https://opendata.camara.cl/camaradiputados/WServices";
const URLS = {
  diputado: (id: number) => `${BASE}/WSDiputado.asmx/retornarDiputado?prmDiputadoId=${id}`,
  diputadosPeriodo: (id: number) => `${BASE}/WSDiputado.asmx/retornarDiputadosXPeriodo?prmPeriodoId=${id}`,
  votacionesBoletin: (b: string) => `${BASE}/WSLegislativo.asmx/retornarVotacionesXProyectoLey?prmNumeroBoletin=${encodeURIComponent(b)}`,
};

export const FichaConfig = z.object({
  slug: z.string(),
  diputadoId: z.number(),
  periodoId: z.number(),
  inicio: z.string(),
  fin: z.string(),
  perfil: z.object({
    nombre: z.string(),
    cargo: z.string(),
    distrito: z.string(),
    trayectoria: z.string(),
    reeleccion: z.string().optional(),
    fuente: z.object({ publisher: z.string(), title: z.string(), url: z.string(), retrievedAt: z.string() }),
    camara: z.string(),
  }),
  programa: z.object({ titulo: z.string(), nota: z.string(), publisher: z.string(), url: z.string(), listado: z.string().optional() }),
  promesas: z.array(
    z.object({
      id: z.string(),
      tema: z.string(),
      cita: z.string(),
      pagina: z.number(),
      boletin: z.string(),
      relacion: z.enum(["implementa", "parcial", "tension"]),
      nota: z.string(),
    }),
  ),
});
export type FichaConfig = z.infer<typeof FichaConfig>;

export function loadFichaConfigs(): FichaConfig[] {
  const dir = path.join(process.cwd(), "data", "seed", "fichas");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => FichaConfig.parse(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))));
}

type Militancia = { desde: string; hasta: string; alias: string };

function militancias(node: unknown): Militancia[] {
  return (collectAll(node, "Militancia") as Record<string, unknown>[]).map((m) => {
    const p = (m.Partido ?? {}) as Record<string, unknown>;
    const end = m.FechaTermino;
    return { desde: String(m.FechaInicio ?? "").slice(0, 10), hasta: typeof end === "string" && end ? end.slice(0, 10) : "9999-12-31", alias: String(p.Alias ?? p.Id ?? "") };
  });
}

/** Party alias on a given date, from the militancias the Cámara records for each deputy. */
export function partyAt(ms: Militancia[], date: string): string | null {
  return ms.find((m) => m.desde <= date && date <= m.hasta)?.alias ?? null;
}

const LABEL: Record<number, string> = { [OPCION.AFIRMATIVO]: "A favor", [OPCION.EN_CONTRA]: "En contra", [OPCION.ABSTENCION]: "Abstención", [OPCION.NO_VOTA]: "No vota" };

/** Majority option (a favor / en contra / abstención) among a group of votes; null on a tie or empty group. */
export function majority(codes: number[]): number | null {
  const counted = [OPCION.AFIRMATIVO, OPCION.EN_CONTRA, OPCION.ABSTENCION].map((c) => [c, codes.filter((x) => x === c).length] as const).sort((a, b) => b[1] - a[1]);
  if (!counted[0][1] || counted[0][1] === counted[1][1]) return null;
  return counted[0][0];
}

export interface FichaVoto {
  id: number;
  fecha: string;
  descripcion: string;
  resultado: string;
  codigo: number;
  opcion: string;
  partido: string | null;
  mayoriaPartido: number | null;
}

function src(snap: Snapshot, title: string, locator: string, value?: number): SourceRef {
  return { publisher: snap.publisher, title, url: snap.url, locator, retrievedAt: snap.retrievedAt, sha256: snap.sha256, verifiedBy: "pipeline", asPrinted: value === undefined ? undefined : String(value), reportedValue: value };
}

async function runFicha(cfg: FichaConfig, notes: string[], issues: string[]) {
  const facts: FactInput[] = [];
  const dipSnap = await fetchSnapshot(URLS.diputado(cfg.diputadoId), "camara");
  const dip = parseXml(dipSnap.body);
  const own = militancias(dip);
  if (!own.length) issues.push(`${cfg.slug}: el registro de la Cámara no trae militancias para el diputado ${cfg.diputadoId}.`);

  // Party of every deputy of the period, by date, for the party-line comparison.
  const perSnap = await fetchImmutable(URLS.diputadosPeriodo(cfg.periodoId), "camara");
  const byDeputy = new Map<number, Militancia[]>();
  for (const raw of collectAll(parseXml(perSnap.body), "Diputado")) {
    const d = raw as Record<string, unknown>;
    byDeputy.set(Number(d.Id), militancias(d.Militancias));
  }

  // Every Sala vote of the term.
  const years: number[] = [];
  for (let y = Number(cfg.inicio.slice(0, 4)); y <= Number(cfg.fin.slice(0, 4)); y++) years.push(y);
  const lists = await Promise.all(years.map((y) => (y < new Date().getFullYear() ? fetchImmutable : fetchSnapshot)(CAMARA_ENDPOINTS.votacionesAnno(y), "camara")));
  const votaciones = lists
    .flatMap((s) => findArray(parseXml(s.body), "Votacion").map((v) => VotacionSchema.parse(v)))
    .filter((v) => v.Fecha.slice(0, 10) >= cfg.inicio && v.Fecha.slice(0, 10) <= cfg.fin);

  const quarantine: number[] = [];
  let missing = 0;
  const votos: FichaVoto[] = [];
  const detailFor = new Map<number, { codigo: number; opcion: string }>();
  await pool(votaciones, Number(process.env.FICHA_CONCURRENCY ?? 4), async (v) => {
    const snap = await fetchImmutable(CAMARA_ENDPOINTS.votacionDetalle(v.Id), "camara");
    const all = findArray(parseXml(snap.body), "Voto").map((x) => {
      const o = x as Record<string, unknown>;
      return { votacionId: v.Id, diputadoId: voteDeputyId(o), ...parseOpcion(o.OpcionVoto) };
    });
    if (!all.length) return;
    if (reconcileVotes(v, all)) {
      quarantine.push(v.Id);
      return;
    }
    const mine = all.find((x) => x.diputadoId === cfg.diputadoId);
    if (!mine) {
      missing++;
      return;
    }
    const fecha = v.Fecha.slice(0, 10);
    const partido = partyAt(own, fecha);
    const peers = partido && partido !== "IND" ? all.filter((x) => x.diputadoId !== cfg.diputadoId && partyAt(byDeputy.get(x.diputadoId) ?? [], fecha) === partido).map((x) => x.codigo) : [];
    detailFor.set(v.Id, { codigo: mine.codigo, opcion: mine.opcion });
    const rawV = v as Record<string, unknown>;
    const resultado = rawV.Resultado && typeof rawV.Resultado === "object" ? String((rawV.Resultado as Record<string, unknown>)["#text"] ?? "") : String(rawV.Resultado ?? "");
    votos.push({ id: v.Id, fecha, descripcion: String(v.Descripcion ?? ""), resultado, codigo: mine.codigo, opcion: LABEL[mine.codigo] ?? mine.opcion, partido, mayoriaPartido: peers.length >= 3 ? majority(peers) : null });
  });
  votos.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id);
  if (quarantine.length > Math.max(10, votaciones.length * 0.02)) issues.push(`${cfg.slug}: ${quarantine.length} de ${votaciones.length} votaciones no cuadran con sus totales.`);
  if (votos.length < votaciones.length * 0.5) issues.push(`${cfg.slug}: solo ${votos.length} de ${votaciones.length} votaciones tienen su voto registrado.`);
  notes.push(`${cfg.slug}: ${votaciones.length} votaciones del periodo, ${votos.length} con su voto, ${quarantine.length} en cuarentena, ${missing} sin su registro`);

  const count = (c: number) => votos.filter((v) => v.codigo === c).length;
  const comparables = votos.filter((v) => v.mayoriaPartido !== null && v.codigo !== OPCION.NO_VOTA);
  const distintas = comparables.filter((v) => v.codigo !== v.mayoriaPartido);
  const listSnap = lists[0];
  const term = `${cfg.inicio.slice(0, 4)}–${cfg.fin.slice(0, 4)}`;
  const base = { asOf: cfg.fin, domain: "congreso" as const };
  const push = (id: string, label: string, definition: string, value: number, locator: string) =>
    facts.push({ ...base, id: `ficha.${cfg.slug}.${id}`, label, definition, value, unit: "conteo", sources: [src(listSnap, `Datos abiertos Cámara · votaciones ${term} y su detalle`, locator, value)] });
  push("votaciones", `Votaciones con voto registrado de ${cfg.perfil.nombre} (${term})`, "Votaciones en Sala del periodo en que aparece en el detalle oficial de votos, excluidas las que no cuadran con sus totales.", votos.length, "retornarVotacionDetalle · Votos");
  push("a_favor", `Votos a favor de ${cfg.perfil.nombre} (${term})`, "Votaciones en que votó afirmativo.", count(OPCION.AFIRMATIVO), "OpcionVoto@Valor=1");
  push("en_contra", `Votos en contra de ${cfg.perfil.nombre} (${term})`, "Votaciones en que votó en contra.", count(OPCION.EN_CONTRA), "OpcionVoto@Valor=0");
  push("abstencion", `Abstenciones de ${cfg.perfil.nombre} (${term})`, "Votaciones en que se abstuvo.", count(OPCION.ABSTENCION), "OpcionVoto@Valor=2");
  push("no_vota", `Votaciones sin voto de ${cfg.perfil.nombre} (${term})`, "Votaciones en que figura como «No vota».", count(OPCION.NO_VOTA), "OpcionVoto@Valor=4");
  push("comparables_partido", `Votaciones comparables con su partido (${term})`, "Votaciones en que militaba en un partido (no independiente), votó, y su partido tuvo una mayoría clara entre al menos 3 de sus otros diputados.", comparables.length, "Militancias por fecha · retornarDiputadosXPeriodo");
  push("distinto_partido", `Veces que votó distinto a la mayoría de su partido (${term})`, "Votaciones comparables en que su voto difiere de la opción mayoritaria de los demás diputados de su partido ese día.", distintas.length, "Militancias por fecha · retornarDiputadosXPeriodo");

  // Program quotes, verified verbatim against the official PDF.
  const progSnap = await fetchSnapshot(cfg.programa.url, cfg.programa.publisher);
  const pages = await pdfPages(new Uint8Array(progSnap.body));
  const promesas = [];
  const rechazadas: { id: string; motivo: string }[] = [];
  for (const p of cfg.promesas) {
    const check = checkQuote({ quote: p.cita, page: p.pagina, topic: "otro", type: "otro" }, pages);
    if (!check.ok) {
      // A quote that isn't verbatim in the official PDF is never published; it is listed for review.
      rechazadas.push({ id: p.id, motivo: check.reason ?? "No verificada" });
      continue;
    }
    const bSnap = await fetchSnapshot(URLS.votacionesBoletin(p.boletin), "camara");
    const proyecto = parseXml(bSnap.body);
    const root = (proyecto.ProyectoLey ?? {}) as Record<string, unknown>;
    const delPeriodo = (collectAll(proyecto, "VotacionProyectoLey") as Record<string, unknown>[])
      .map((v) => ({ id: Number(v.Id), fecha: String(v.Fecha ?? "").slice(0, 10), tipo: typeof v.TipoVotacionProyectoLey === "object" ? String((v.TipoVotacionProyectoLey as Record<string, unknown>)["#text"] ?? "") : String(v.TipoVotacionProyectoLey ?? ""), articulo: String(v.Articulo ?? "") }))
      .filter((v) => v.fecha >= cfg.inicio && v.fecha <= cfg.fin);
    const suyos: { id: number; fecha: string; tipo: string; articulo: string; codigo: number; opcion: string }[] = [];
    for (const v of delPeriodo) {
      let d = detailFor.get(v.id);
      if (!d) {
        const snap = await fetchImmutable(CAMARA_ENDPOINTS.votacionDetalle(v.id), "camara");
        const m = findArray(parseXml(snap.body), "Voto").map((x) => x as Record<string, unknown>).find((o) => voteDeputyId(o) === cfg.diputadoId);
        if (m) d = parseOpcion(m.OpcionVoto);
      }
      if (d) suyos.push({ ...v, codigo: d.codigo, opcion: LABEL[d.codigo] ?? d.opcion });
    }
    const tally = Object.fromEntries([OPCION.AFIRMATIVO, OPCION.EN_CONTRA, OPCION.ABSTENCION, OPCION.NO_VOTA].map((c) => [LABEL[c], suyos.filter((s) => s.codigo === c).length]));
    promesas.push({
      ...p,
      pagina: check.foundOnPage ?? p.pagina,
      proyecto: { boletin: p.boletin, nombre: String(root.Nombre ?? ""), url: bSnap.url, votacionesEnPeriodo: delPeriodo.length },
      votos: suyos.sort((a, b) => a.fecha.localeCompare(b.fecha)),
      tally,
      dominante: suyos.length ? majorityLabel(suyos.map((s) => s.codigo)) : null,
    });
  }
  notes.push(`${cfg.slug}: ${promesas.length} de ${cfg.promesas.length} citas verificadas textual en el programa (${pages.length} páginas)`);

  const porAnno = years.map((y) => {
    const vs = votos.filter((v) => v.fecha.startsWith(String(y)));
    return { anno: y, total: vs.length, aFavor: vs.filter((v) => v.codigo === OPCION.AFIRMATIVO).length, enContra: vs.filter((v) => v.codigo === OPCION.EN_CONTRA).length, abstencion: vs.filter((v) => v.codigo === OPCION.ABSTENCION).length, noVota: vs.filter((v) => v.codigo === OPCION.NO_VOTA).length };
  });

  return {
    facts,
    record: {
      slug: cfg.slug,
      perfil: cfg.perfil,
      militancias: own,
      programa: { ...cfg.programa, sha256: progSnap.sha256, retrievedAt: progSnap.retrievedAt, paginas: pages.length },
      periodo: { inicio: cfg.inicio, fin: cfg.fin, votaciones: votaciones.length },
      porAnno,
      promesas,
      disidencias: distintas.slice(0, 40).map((v) => ({ ...v, mayoriaPartido: LABEL[v.mayoriaPartido!] })),
      cuarentena: quarantine,
      rechazadas,
    },
  };
}

function majorityLabel(codes: number[]): string {
  const counts = new Map<number, number>();
  for (const c of codes) counts.set(c, (counts.get(c) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return LABEL[top] ?? String(top);
}

export const fichas: Connector = {
  id: "fichas",
  description: "Fichas de parlamentarios · votos de todo el periodo frente a citas textuales de su programa",
  async run(): Promise<ConnectorResult> {
    const notes: string[] = [];
    const issues: string[] = [];
    const facts: FactInput[] = [];
    const records: unknown[] = [];
    for (const cfg of loadFichaConfigs()) {
      const r = await runFicha(cfg, notes, issues);
      facts.push(...r.facts);
      records.push(r.record);
    }
    return { connector: this.id, facts, records: { fichas: records }, issues, notes };
  },
};
