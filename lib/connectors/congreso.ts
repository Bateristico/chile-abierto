import { fetchImmutable, fetchSnapshot, pool, type Snapshot } from "./http";
import { CAMARA_ENDPOINTS, collectAll, findArray, parseOpcion, parseXml, reconcileVotes, VotacionSchema, voteDeputyId } from "./camara";
import type { Connector, ConnectorResult } from "./types";
import type { FactInput, SourceRef } from "../provenance/types";
import { boletinOf, type CongresoData, type Diputado, type Militancia, type Periodo, type Proyecto, type Votacion } from "../congreso/types";

/**
 * Congreso: every roll call of the Cámara for each legislative period, with every deputy's vote, the deputies'
 * militancias by date and the bills behind the votes (name, initiative, topics, kind of vote, article).
 * Past documents are cached (fetchImmutable); a bill's vote list is re-read when a new vote on it appears.
 */
const BASE = process.env.CAMARA_WS_BASE ?? "https://opendata.camara.cl/camaradiputados/WServices";
const URLS = {
  diputadosPeriodo: (id: number) => `${BASE}/WSDiputado.asmx/retornarDiputadosXPeriodo?prmPeriodoId=${id}`,
  proyecto: (b: string) => `${BASE}/WSLegislativo.asmx/retornarVotacionesXProyectoLey?prmNumeroBoletin=${encodeURIComponent(b)}`,
};

export const PERIODOS = [
  { id: 10, nombre: "2022–2026", inicio: "2022-03-11", fin: "2026-03-10" },
  { id: 11, nombre: "2026–2030", inicio: "2026-03-11", fin: "2030-03-10" },
];

const text = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return String((v as Record<string, unknown>)["#text"] ?? "");
  return String(v);
};

export function parseMilitancias(node: unknown): Militancia[] {
  return (collectAll(node, "Militancia") as Record<string, unknown>[])
    .map((m) => {
      const p = (m.Partido ?? {}) as Record<string, unknown>;
      const end = m.FechaTermino;
      return {
        desde: String(m.FechaInicio ?? "").slice(0, 10),
        hasta: typeof end === "string" && end ? end.slice(0, 10) : "9999-12-31",
        alias: String(p.Alias ?? p.Id ?? "SIN"),
        nombre: String(p.Nombre ?? ""),
      };
    })
    .sort((a, b) => a.desde.localeCompare(b.desde));
}

export function parsePeriodDeputies(xml: Buffer | string): Diputado[] {
  const seen = new Map<number, Diputado>();
  for (const raw of collectAll(parseXml(xml), "Diputado")) {
    const d = raw as Record<string, unknown>;
    const id = Number(d.Id);
    if (!Number.isFinite(id) || seen.has(id)) continue;
    const nombre = [d.Nombre, d.ApellidoPaterno, d.ApellidoMaterno].filter((x) => x && typeof x !== "object").join(" ");
    seen.set(id, { id, nombre, sexo: text(d.Sexo), militancias: parseMilitancias(d.Militancias) });
  }
  return [...seen.values()].sort((a, b) => a.id - b.id);
}

/** Option codes of one vote, aligned with `orden`; '.' for deputies not in the detail. */
export function encodeVotes(orden: number[], votes: { diputadoId: number; codigo: number }[]): string {
  const byId = new Map(votes.map((v) => [v.diputadoId, v.codigo]));
  return orden.map((id) => (byId.has(id) ? String(byId.get(id)).slice(0, 1) : ".")).join("");
}

const DAY = 86_400_000;

async function runPeriodo(p: (typeof PERIODOS)[number], notes: string[], issues: string[], facts: FactInput[]): Promise<Periodo | null> {
  const today = new Date().toISOString().slice(0, 10);
  if (p.inicio > today) return null;
  const closed = p.fin < today;
  const dipSnap = await (closed ? fetchImmutable : fetchSnapshot)(URLS.diputadosPeriodo(p.id), "camara");
  const diputados = parsePeriodDeputies(dipSnap.body);
  if (diputados.length < 155) issues.push(`Periodo ${p.nombre}: solo ${diputados.length} diputados en el registro.`);
  const orden = diputados.map((d) => d.id);
  const known = new Set(orden);

  const years: number[] = [];
  for (let y = Number(p.inicio.slice(0, 4)); y <= Math.min(Number(p.fin.slice(0, 4)), Number(today.slice(0, 4))); y++) years.push(y);
  const currentYear = Number(today.slice(0, 4));
  const lists: Snapshot[] = [];
  for (const y of years) lists.push(await (y < currentYear ? fetchImmutable : fetchSnapshot)(CAMARA_ENDPOINTS.votacionesAnno(y), "camara"));
  const raw = lists
    .flatMap((s) => findArray(parseXml(s.body), "Votacion").map((v) => VotacionSchema.parse(v)))
    .filter((v) => v.Fecha.slice(0, 10) >= p.inicio && v.Fecha.slice(0, 10) <= p.fin);

  const cuarentena: number[] = [];
  const unknownDeputies = new Set<number>();
  const votaciones: (Votacion | null)[] = await pool(raw, Number(process.env.CONGRESO_CONCURRENCY ?? 4), async (v) => {
    const recent = Date.now() - Date.parse(v.Fecha) < 2 * DAY;
    const snap = await (recent ? fetchSnapshot : fetchImmutable)(CAMARA_ENDPOINTS.votacionDetalle(v.Id), "camara");
    const votes = findArray(parseXml(snap.body), "Voto").map((x) => {
      const o = x as Record<string, unknown>;
      return { votacionId: v.Id, diputadoId: voteDeputyId(o), ...parseOpcion(o.OpcionVoto) };
    });
    if (votes.length && reconcileVotes(v, votes)) {
      cuarentena.push(v.Id);
      return null;
    }
    for (const x of votes) if (!known.has(x.diputadoId)) unknownDeputies.add(x.diputadoId);
    const r = v as Record<string, unknown>;
    return { id: v.Id, f: v.Fecha, d: String(v.Descripcion ?? ""), b: boletinOf(String(v.Descripcion ?? "")), si: v.TotalSi, no: v.TotalNo, ab: v.TotalAbstencion, q: text(r.Quorum), r: text(r.Resultado), c: encodeVotes(orden, votes) };
  });
  const ok = votaciones.filter((v): v is Votacion => v !== null).sort((a, b) => b.f.localeCompare(a.f) || b.id - a.id);
  if (cuarentena.length > Math.max(10, raw.length * 0.02)) issues.push(`Periodo ${p.nombre}: ${cuarentena.length} de ${raw.length} votaciones no cuadran con sus totales.`);
  if (unknownDeputies.size > 5) issues.push(`Periodo ${p.nombre}: ${unknownDeputies.size} diputados votan pero no están en el registro del periodo.`);
  notes.push(`${p.nombre}: ${diputados.length} diputados, ${ok.length} votaciones cuadradas, ${cuarentena.length} en cuarentena`);

  const src = (s: Snapshot, title: string, locator: string, value: number): SourceRef => ({ publisher: "camara", title, url: s.url, locator, retrievedAt: s.retrievedAt, sha256: s.sha256, verifiedBy: "pipeline", asPrinted: String(value), reportedValue: value });
  facts.push({
    id: `congreso.p${p.id}.votaciones`,
    label: `Votaciones en Sala del periodo ${p.nombre} con votos que cuadran`,
    definition: "Votaciones del periodo cuyo detalle de votos individuales suma los totales oficiales; las que no cuadran quedan fuera.",
    value: ok.length,
    unit: "conteo",
    asOf: today,
    domain: "congreso",
    sources: [src(lists.at(-1)!, `Datos abiertos Cámara · votaciones ${p.nombre} y su detalle`, "retornarVotacionesXAnno + retornarVotacionDetalle", ok.length)],
  });
  return { id: p.id, nombre: p.nombre, inicio: p.inicio, fin: p.fin, diputados, orden, votaciones: ok, cuarentena };
}

/** Bill metadata and per-vote details (kind of vote, article, stage) from the by-bill service. */
async function enrichBills(periodos: Periodo[], notes: string[]): Promise<Record<string, Proyecto>> {
  const byBill = new Map<string, Votacion[]>();
  for (const p of periodos) for (const v of p.votaciones) if (v.b) byBill.set(v.b, [...(byBill.get(v.b) ?? []), v]);
  const proyectos: Record<string, Proyecto> = {};
  let failed = 0;
  await pool([...byBill.keys()], Number(process.env.CONGRESO_CONCURRENCY ?? 4), async (b) => {
    const votes = byBill.get(b)!;
    const latest = votes.reduce((m, v) => (v.f > m ? v.f : m), "");
    try {
      const snap = await fetchImmutable(URLS.proyecto(b), "camara", latest);
      const doc = parseXml(snap.body);
      const root = (doc.ProyectoLey ?? {}) as Record<string, unknown>;
      proyectos[b] = {
        nombre: text(root.Nombre),
        iniciativa: text(root.TipoIniciativa),
        materias: (collectAll(root.Materias, "Materia") as Record<string, unknown>[]).map((m) => text(m.Nombre)).filter(Boolean),
      };
      const detail = new Map((collectAll(doc, "VotacionProyectoLey") as Record<string, unknown>[]).map((x) => [Number(x.Id), x]));
      for (const v of votes) {
        const x = detail.get(v.id);
        if (!x) continue;
        v.tipo = text(x.TipoVotacionProyectoLey) || undefined;
        v.art = text(x.Articulo).replace(/\s+/g, " ").trim().slice(0, 280) || undefined;
        v.tram = text(x.TramiteConstitucional) || undefined;
      }
    } catch {
      failed++;
    }
  });
  notes.push(`${Object.keys(proyectos).length} proyectos con nombre y materias${failed ? `, ${failed} sin respuesta` : ""}`);
  return proyectos;
}

export const congreso: Connector = {
  id: "congreso",
  description: "Congreso · todas las votaciones de la Cámara por periodo, con cada voto, militancias y proyectos",
  async run(): Promise<ConnectorResult> {
    const notes: string[] = [];
    const issues: string[] = [];
    const facts: FactInput[] = [];
    const periodos: Periodo[] = [];
    for (const p of PERIODOS) {
      const r = await runPeriodo(p, notes, issues, facts);
      if (r) periodos.push(r);
    }
    const proyectos = await enrichBills(periodos, notes);
    const data: CongresoData = { generadoEl: new Date().toISOString(), periodos, proyectos };
    return { connector: this.id, facts, records: { congreso: [data] }, issues, notes };
  },
};
