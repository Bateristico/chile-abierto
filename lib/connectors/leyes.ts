import fs from "node:fs";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import { fetchImmutable, fetchSnapshot, pool, type Snapshot } from "./http";
import { collectAll, parseXml } from "./camara";
import type { Connector, ConnectorResult } from "./types";
import type { FactInput, SourceRef } from "../provenance/types";
import { daysToLaw, median, type Bill, type BillStatus, type Etapa, type LeyesData, type Urgencia } from "../leyes/types";
import { GOBIERNO_ACTUAL } from "../leyes/gobiernos";
import type { CongresoData } from "../congreso/types";

/**
 * Leyes: every bill filed since March 2022 (Mensajes and Mociones, both chambers) plus older bills voted in the Cámara
 * since then, with their path to law: stages and dates, urgencies, result, law number and publication.
 *
 * - Universe: the Cámara's yearly lists of Mociones and Mensajes (retornarMocionesXAnno / retornarMensajesXAnno).
 * - Path to law: the Senado's public tramitación service, which covers both chambers.
 * - Authors: the Cámara's bill service (deputy ids), fetched once per Moción.
 *
 * A finished bill (published, archived, withdrawn, rejected) is never downloaded again. Bills in progress are re-read
 * every few days (daily with an urgency, or when the Cámara votes on them), staggered so each run stays short.
 */
const CAMARA = process.env.CAMARA_WS_BASE ?? "https://opendata.camara.cl/camaradiputados/WServices";
const SENADO = "https://tramitacion.senado.cl/wspublico";
export const LEYES_DESDE = "2022-03-11";

const URLS = {
  mociones: (y: number) => `${CAMARA}/WSLegislativo.asmx/retornarMocionesXAnno?prmAnno=${y}`,
  mensajes: (y: number) => `${CAMARA}/WSLegislativo.asmx/retornarMensajesXAnno?prmAnno=${y}`,
  proyecto: (b: string) => `${CAMARA}/WSLegislativo.asmx/retornarProyectoLey?prmNumeroBoletin=${encodeURIComponent(b)}`,
  tramitacion: (b: string) => `${SENADO}/tramitacion.php?boletin=${encodeURIComponent(b.split("-")[0])}`,
};

const senadoParser = new XMLParser({
  ignoreAttributes: true,
  trimValues: true,
  parseTagValue: false,
  isArray: (name) => ["proyecto", "tramite", "urgencia", "materia", "autor", "informe", "oficio", "observacion"].includes(name),
});

const str = (v: unknown): string => (v === null || v === undefined || typeof v === "object" ? "" : String(v).trim());

/** "26/04/2023" → "2023-04-26" */
export function dmy(s: string): string {
  const m = str(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
}

export function statusOf(estado: string): BillStatus {
  const e = estado.toLowerCase();
  if (e.startsWith("publicad")) return "ley";
  if (e.includes("tramitaci")) return "tramite";
  if (e.startsWith("archivad")) return "archivado";
  if (e.startsWith("retirad")) return "retirado";
  if (e.startsWith("rechazad") || e.includes("inadmisib")) return "rechazado";
  return "otro";
}

/** Stage periods from the event log: each stage runs from its first event to the next stage's first event. */
export function etapasFrom(tramites: { fecha: string; etapa: string; camara: string }[]): Etapa[] {
  const out: Etapa[] = [];
  for (const t of [...tramites].filter((t) => t.fecha).sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const last = out.at(-1);
    if (last && last.etapa === t.etapa && last.camara === t.camara) last.hasta = t.fecha;
    else {
      if (last) last.hasta = last.hasta < t.fecha ? t.fecha : last.hasta;
      out.push({ etapa: t.etapa, camara: t.camara, desde: t.fecha, hasta: t.fecha });
    }
  }
  return out;
}

const SEÑALES: [RegExp, string][] = [
  [/comisi[oó]n mixta/i, "Comisión Mixta"],
  [/tribunal constitucional/i, "Control del Tribunal Constitucional"],
  [/observaciones|veto/i, "Observaciones del Presidente (veto)"],
  [/insistencia/i, "Insistencia"],
];

/** One bill from the Senado's tramitación service; null if the service has no record (new bills appear a few days late). */
export function parseSenadoBill(xml: Buffer | string): Omit<Bill, "autores" | "camaraId"> | null {
  const doc = senadoParser.parse(typeof xml === "string" ? xml : xml.toString("utf8")) as Record<string, unknown>;
  const p = ((doc.proyectos as Record<string, unknown> | undefined)?.proyecto as Record<string, unknown>[] | undefined)?.[0];
  if (!p) return null;
  const d = (p.descripcion ?? {}) as Record<string, unknown>;
  const b = str(d.boletin);
  if (!b) return null;
  const tramites = ((p.tramitacion as Record<string, unknown> | undefined)?.tramite as Record<string, unknown>[] | undefined ?? []).map((t) => ({
    fecha: dmy(str(t.FECHA)),
    descripcion: str(t.DESCRIPCIONTRAMITE).replace(/\s+/g, " "),
    etapa: str(t.ETAPDESCRIPCION),
    camara: str(t.CAMARATRAMITE),
  }));
  const urgencias: Urgencia[] = ((p.urgencias as Record<string, unknown> | undefined)?.urgencia as Record<string, unknown>[] | undefined ?? [])
    .map((u) => ({ tipo: str(u.TIPO), desde: dmy(str(u.FECHAINGRESO)), hasta: dmy(str(u.FECHARETIRO)) || undefined }))
    .filter((u) => u.desde);
  const estado = str(d.estado);
  const etapa = str(d.etapa);
  const ultimo = [...tramites].filter((t) => t.fecha).sort((a, c) => c.fecha.localeCompare(a.fecha))[0];
  const text = [...tramites.map((t) => `${t.etapa} ${t.descripcion}`), etapa].join(" \n ");
  const autoresNombres = ((p.autores as Record<string, unknown> | undefined)?.autor as Record<string, unknown>[] | undefined ?? []).map((a) => str(a.PARLAMENTARIO)).filter(Boolean);
  return {
    b,
    titulo: str(d.titulo).replace(/\s+/g, " "),
    iniciativa: str(d.iniciativa),
    origen: /senado/i.test(str(d.camara_origen)) ? "S" : "C",
    ingreso: dmy(str(d.fecha_ingreso)),
    etapa,
    estado,
    st: statusOf(estado),
    ley: str(d.leynro).replace(/^Ley\s*N[°º]?\s*/i, "") || undefined,
    publicada: dmy(str(d.diariooficial)) || undefined,
    urgenciaActual: str(d.urgencia_actual) || undefined,
    urgencias,
    etapas: etapasFrom(tramites),
    ultimo: ultimo ? { fecha: ultimo.fecha, descripcion: ultimo.descripcion.slice(0, 220) } : undefined,
    materias: ((p.materias as Record<string, unknown> | undefined)?.materia as Record<string, unknown>[] | undefined ?? []).map((m) => str(m.DESCRIPCION)).filter(Boolean),
    autoresNombres,
    refundidos: str(d.refundidos).split(/[,;\s]+/).filter((x) => /^\d{3,5}-\d{2}$/.test(x)),
    movimientos: tramites.length,
    señales: SEÑALES.filter(([re]) => re.test(text)).map(([, label]) => label),
  };
}

export interface ListedBill {
  camaraId: number;
  b: string;
  nombre: string;
  ingreso: string;
  iniciativa: string;
  origen: "C" | "S";
}

/** The Cámara's yearly list of Mociones or Mensajes. */
export function parseCamaraList(xml: Buffer | string): ListedBill[] {
  return (collectAll(parseXml(xml), "ProyectoLey") as Record<string, unknown>[])
    .map((p) => ({
      camaraId: Number(p.Id),
      b: str(p.NumeroBoletin),
      nombre: str(p.Nombre),
      ingreso: str(p.FechaIngreso).slice(0, 10),
      iniciativa: str((p.TipoIniciativa as Record<string, unknown> | undefined)?.["#text"] ?? p.TipoIniciativa),
      origen: (/senado/i.test(str((p.CamaraOrigen as Record<string, unknown> | undefined)?.["#text"] ?? p.CamaraOrigen)) ? "S" : "C") as "C" | "S",
    }))
    .filter((p) => /^\d{3,5}-\d{2}$/.test(p.b));
}

/** Deputy ids among a bill's authors (the Cámara lists deputies with their id; senators have none here). */
export function parseCamaraAuthors(xml: Buffer | string): number[] {
  const ids = (collectAll(parseXml(xml), "ParlamentarioAutor") as Record<string, unknown>[])
    .map((a) => (Array.isArray(a.Diputado) ? a.Diputado[0] : a.Diputado) as Record<string, unknown> | undefined)
    .map((d) => Number(d?.Id))
    .filter((n) => Number.isFinite(n) && n > 0);
  return [...new Set(ids)];
}

// ---- State kept between runs (data/cache is persisted by the workflow) ----

interface Entry {
  fetchedAt: string;
  next: string;
  bill: Omit<Bill, "autores" | "camaraId"> | null;
  autores?: number[];
}
const STATE = path.join(process.cwd(), "data", "cache", "leyes", "state.json");
const TERMINAL: BillStatus[] = ["ley", "archivado", "retirado", "rechazado"];

function hashInt(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

/** When to read a bill again: never once finished; tomorrow with an urgency; otherwise in 3–9 days (staggered). */
export function nextRefresh(bill: Omit<Bill, "autores" | "camaraId"> | null, today: string): string {
  if (bill && TERMINAL.includes(bill.st)) return "9999-12-31";
  const days = !bill ? 1 : bill.urgenciaActual && !/sin urgencia/i.test(bill.urgenciaActual) ? 1 : 3 + (hashInt(bill.b) % 7);
  return new Date(Date.parse(today) + days * 86_400_000).toISOString().slice(0, 10);
}

function loadState(): Record<string, Entry> {
  try {
    return JSON.parse(fs.readFileSync(STATE, "utf8")) as Record<string, Entry>;
  } catch {
    return {};
  }
}

/** Bills voted in the Cámara (from the congreso connector, which runs first) with the date of their latest vote. */
function votedBills(): Map<string, string> {
  const out = new Map<string, string>();
  const file = path.join(process.cwd(), "data", "store", "congreso.records.json");
  if (!fs.existsSync(file)) return out;
  const data = (JSON.parse(fs.readFileSync(file, "utf8")) as { congreso: CongresoData[] }).congreso[0];
  for (const p of data?.periodos ?? [])
    for (const v of p.votaciones) {
      const d = v.f.slice(0, 10);
      if (v.b && d >= LEYES_DESDE && (out.get(v.b) ?? "") < d) out.set(v.b, d);
    }
  return out;
}

export const leyes: Connector = {
  id: "leyes",
  description: "Leyes · cada proyecto desde 2022: etapas, urgencias, autores, ley y publicación (Senado y Cámara)",
  async run(): Promise<ConnectorResult> {
    const notes: string[] = [];
    const issues: string[] = [];
    const facts: FactInput[] = [];
    const today = new Date().toISOString().slice(0, 10);
    const currentYear = Number(today.slice(0, 4));

    // 1. Universe
    const listed = new Map<string, ListedBill>();
    let lastList: Snapshot | null = null;
    for (let y = Number(LEYES_DESDE.slice(0, 4)); y <= currentYear; y++) {
      for (const url of [URLS.mociones(y), URLS.mensajes(y)]) {
        const snap = await (y < currentYear ? fetchImmutable : fetchSnapshot)(url, "camara");
        lastList = snap;
        for (const x of parseCamaraList(snap.body)) if (x.ingreso >= LEYES_DESDE && !listed.has(x.b)) listed.set(x.b, x);
      }
    }
    const voted = votedBills();
    const universe = [...new Set([...listed.keys(), ...voted.keys()])];

    // 2. Path to law (Senado) and authors (Cámara), refreshing only what may have changed
    const state = loadState();
    const max = Number(process.env.LEYES_MAX_FETCH ?? 6000);
    const due = universe.filter((b) => {
      const e = state[b];
      if (!e) return true;
      if (e.next <= today) return true;
      const lastVote = voted.get(b);
      return !!lastVote && lastVote >= e.fetchedAt.slice(0, 10) && !(e.bill && TERMINAL.includes(e.bill.st));
    });
    const todo = due.slice(0, max);
    let failed = 0;
    let missing = 0;
    await pool(todo, Number(process.env.LEYES_CONCURRENCY ?? 6), async (b) => {
      try {
        const snap = await fetchSnapshot(URLS.tramitacion(b), "senado", {}, 3, false);
        let bill = parseSenadoBill(snap.body);
        if (bill && bill.b !== b) bill = null; // the service matches by number; a different suffix is a different bill
        if (!bill) missing++;
        const prev = state[b];
        state[b] = { fetchedAt: snap.retrievedAt, next: nextRefresh(bill, today), bill, autores: prev?.autores };
      } catch {
        failed++;
      }
    });
    // Authors: once per Moción
    const needAuthors = universe.filter((b) => state[b] && !state[b].autores && (listed.get(b)?.iniciativa ?? state[b].bill?.iniciativa ?? "").startsWith("Moci"));
    let authorFails = 0;
    await pool(needAuthors.slice(0, max), Number(process.env.LEYES_CONCURRENCY ?? 6), async (b) => {
      try {
        const snap = await fetchImmutable(URLS.proyecto(b), "camara");
        state[b].autores = parseCamaraAuthors(snap.body);
      } catch {
        authorFails++;
      }
    });
    fs.mkdirSync(path.dirname(STATE), { recursive: true });
    fs.writeFileSync(STATE, JSON.stringify(state));

    // 3. Records
    const bills: Bill[] = [];
    for (const b of universe) {
      const e = state[b];
      const l = listed.get(b);
      if (e?.bill) bills.push({ ...e.bill, camaraId: l?.camaraId, autores: e.autores ?? [] });
      else if (l)
        bills.push({
          b, camaraId: l.camaraId, titulo: l.nombre, iniciativa: l.iniciativa, origen: l.origen, ingreso: l.ingreso, etapa: "Primer trámite constitucional", estado: "En tramitación", st: "tramite",
          urgencias: [], etapas: [], materias: [], autores: e?.autores ?? [], autoresNombres: [], refundidos: [], movimientos: 0, señales: [],
        });
    }
    bills.sort((a, c) => c.ingreso.localeCompare(a.ingreso));
    const pending = due.length - todo.length;
    notes.push(`${bills.length} proyectos (${listed.size} ingresados desde ${LEYES_DESDE}, ${voted.size} votados en Sala), ${todo.length} actualizados${pending ? `, ${pending} quedan para la próxima captura` : ""}`);
    if (missing) notes.push(`${missing} aún sin ficha en el Senado`);
    if (failed > Math.max(20, todo.length * 0.1)) issues.push(`El servicio del Senado falló en ${failed} de ${todo.length} proyectos.`);
    if (authorFails > Math.max(20, needAuthors.length * 0.1)) issues.push(`El servicio de la Cámara falló al leer autores en ${authorFails} proyectos.`);

    // 4. Headline facts
    if (lastList) {
      const src = (value: number): SourceRef => ({ publisher: "senado", title: "Senado · tramitación de proyectos (servicio público) y Cámara · listas de Mensajes y Mociones", url: `${SENADO}/tramitacion.php`, locator: "descripcion: estado, leynro, diariooficial", retrievedAt: lastList!.retrievedAt, sha256: lastList!.sha256, verifiedBy: "pipeline", asPrinted: String(value), reportedValue: value });
      const add = (id: string, label: string, definition: string, value: number, unit: "conteo" | "dias" = "conteo") =>
        facts.push({ id, label, definition, value, unit, asOf: today, domain: "congreso", sources: [src(value)] });
      const gov = bills.filter((b) => b.iniciativa === "Mensaje" && b.ingreso >= GOBIERNO_ACTUAL.desde && b.ingreso <= GOBIERNO_ACTUAL.hasta);
      add(`leyes.${GOBIERNO_ACTUAL.id}.mensajes`, `Proyectos enviados por el ${GOBIERNO_ACTUAL.nombre}`, `Mensajes ingresados desde el ${GOBIERNO_ACTUAL.desde}.`, gov.length);
      add(`leyes.${GOBIERNO_ACTUAL.id}.publicadas`, `Proyectos del ${GOBIERNO_ACTUAL.nombre} ya publicados como ley`, "Mensajes del gobierno con ley publicada en el Diario Oficial.", gov.filter((b) => b.st === "ley").length);
      const laws = bills.filter((b) => b.st === "ley" && (b.publicada ?? "") >= LEYES_DESDE);
      add("leyes.publicadas_desde_2022", "Leyes publicadas desde el 11 de marzo de 2022", "Proyectos con ley publicada en el Diario Oficial desde el 11-03-2022, entre los ingresados desde esa fecha o votados en la Cámara desde entonces.", laws.length);
      const d = median(laws.map(daysToLaw).filter((x): x is number => x !== null));
      if (d !== null) add("leyes.mediana_dias_a_ley", "Días que tarda un proyecto en ser ley (mediana)", "Mediana de días entre el ingreso y la publicación, leyes publicadas desde el 11-03-2022.", d, "dias");
    }

    const data: LeyesData = { generadoEl: new Date().toISOString(), desde: LEYES_DESDE, bills };
    return { connector: this.id, facts, records: { leyes: [data] }, issues, notes };
  },
};
