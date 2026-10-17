import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import { fetchSnapshot, type Snapshot } from "./http";
import type { Connector, ConnectorResult } from "./types";
import type { FactInput, SourceRef } from "../provenance/types";

/**
 * Cámara de Diputadas y Diputados open data (XML web services).
 * Methods documented at https://camara.cl/transparencia/datosAbiertos.aspx; schema at https://opendata.camara.cl/camaradiputados/v1/.
 * The first run should confirm the parameter names below against the live service (see README, «Primera ingesta»).
 */
const BASE = process.env.CAMARA_WS_BASE ?? "https://opendata.camara.cl/camaradiputados/WServices";
export const CAMARA_ENDPOINTS = {
  diputadosActuales: () => `${BASE}/WSDiputado.asmx/retornarDiputadosPeriodoActual`,
  votacionesAnno: (year: number) => `${BASE}/WSLegislativo.asmx/retornarVotacionesXAnno?prmAnno=${year}`,
  votacionDetalle: (id: number) => `${BASE}/WSLegislativo.asmx/retornarVotacionDetalle?prmVotacionId=${id}`,
};

export const EXPECTED_DEPUTIES = 155;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  textNodeName: "#text",
  isArray: (name) => ["Diputado", "Votacion", "Voto", "Militancia"].includes(name),
  parseTagValue: true,
});

export function parseXml(body: Buffer | string): Record<string, unknown> {
  return parser.parse(typeof body === "string" ? body : body.toString("utf8"));
}

/** Find the first array stored under `key` anywhere in a parsed XML tree. */
export function findArray(node: unknown, key: string): unknown[] {
  if (!node || typeof node !== "object") return [];
  const obj = node as Record<string, unknown>;
  if (Array.isArray(obj[key])) return obj[key] as unknown[];
  for (const v of Object.values(obj)) {
    const found = findArray(v, key);
    if (found.length) return found;
  }
  return [];
}

export const DiputadoSchema = z
  .object({
    Id: z.coerce.number(),
    Nombre: z.string(),
    ApellidoPaterno: z.string().optional(),
    ApellidoMaterno: z.string().optional(),
  })
  .passthrough();

export const VotacionSchema = z
  .object({
    Id: z.coerce.number(),
    Descripcion: z.string().optional(),
    Fecha: z.string(),
    TotalSi: z.coerce.number(),
    TotalNo: z.coerce.number(),
    TotalAbstencion: z.coerce.number(),
    TotalDispensado: z.coerce.number(),
  })
  .passthrough();

/**
 * Vote options as coded by the Cámara (OpcionVoto@Valor), confirmed against the live service on 17 Oct 2026:
 * 1 Afirmativo, 0 En Contra, 2 Abstención, 4 No Vota. Classify by code, never by label: "No Vota" starts with "No".
 */
export const OPCION = { AFIRMATIVO: 1, EN_CONTRA: 0, ABSTENCION: 2, NO_VOTA: 4 } as const;

export interface VoteRecord {
  votacionId: number;
  diputadoId: number;
  /** Official option code (OpcionVoto@Valor). */
  codigo: number;
  opcion: string;
}

/** Reconciliation: individual votes must add up to the totals the Cámara publishes for the same vote. */
export function reconcileVotes(v: z.infer<typeof VotacionSchema>, votes: VoteRecord[]): string | null {
  const count = (code: number) => votes.filter((x) => x.codigo === code).length;
  const si = count(OPCION.AFIRMATIVO);
  const no = count(OPCION.EN_CONTRA);
  const abs = count(OPCION.ABSTENCION);
  if (si !== v.TotalSi || no !== v.TotalNo || abs !== v.TotalAbstencion) {
    return `Votación ${v.Id}: votos individuales (sí ${si}, no ${no}, abst ${abs}) no cuadran con los totales publicados (sí ${v.TotalSi}, no ${v.TotalNo}, abst ${v.TotalAbstencion}).`;
  }
  return null;
}

/** Parse one OpcionVoto node into its official code and label. */
export function parseOpcion(node: unknown): { codigo: number; opcion: string } {
  if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    return { codigo: Number(o["@_Valor"]), opcion: String(o["#text"] ?? "") };
  }
  return { codigo: Number.NaN, opcion: String(node ?? "") };
}

function src(snap: Snapshot, title: string, locator: string, asPrinted?: string, reportedValue?: number): SourceRef {
  return { publisher: "camara", title, url: snap.url, locator, retrievedAt: snap.retrievedAt, sha256: snap.sha256, verifiedBy: "pipeline", asPrinted, reportedValue };
}

export const camara: Connector = {
  id: "camara",
  description: "Cámara · diputados en ejercicio, votaciones del año y votos individuales",
  async run({ year }): Promise<ConnectorResult> {
    const issues: string[] = [];
    const notes: string[] = [];
    const facts: FactInput[] = [];

    const dipSnap = await fetchSnapshot(CAMARA_ENDPOINTS.diputadosActuales(), "camara");
    const diputados = findArray(parseXml(dipSnap.body), "Diputado").map((d) => DiputadoSchema.parse(d));
    if (diputados.length !== EXPECTED_DEPUTIES) issues.push(`Se esperaban ${EXPECTED_DEPUTIES} diputados en ejercicio y llegaron ${diputados.length}.`);
    facts.push({
      id: "camara.diputados_en_ejercicio",
      label: "Diputadas y diputados en ejercicio",
      definition: "Integrantes de la Cámara en el periodo legislativo actual según su servicio de datos abiertos.",
      value: diputados.length,
      unit: "personas",
      asOf: dipSnap.retrievedAt.slice(0, 10),
      domain: "congreso",
      sources: [src(dipSnap, "Datos abiertos Cámara · retornarDiputadosPeriodoActual", "Diputado[]", String(diputados.length), diputados.length)],
    });

    const votSnap = await fetchSnapshot(CAMARA_ENDPOINTS.votacionesAnno(year), "camara");
    const votaciones = findArray(parseXml(votSnap.body), "Votacion").map((v) => VotacionSchema.parse(v));
    notes.push(`${votaciones.length} votaciones en ${year}`);
    facts.push({
      id: `camara.votaciones_${year}`,
      label: `Votaciones en la Cámara durante ${year}`,
      definition: "Número de votaciones registradas por la Cámara en el año (Sala y otras instancias informadas por el servicio).",
      value: votaciones.length,
      unit: "conteo",
      asOf: votSnap.retrievedAt.slice(0, 10),
      domain: "congreso",
      sources: [src(votSnap, `Datos abiertos Cámara · retornarVotacionesXAnno ${year}`, "Votacion[]")],
    });

    // Individual votes. A vote whose detail doesn't reconcile with its published totals is quarantined (listed, not
    // published); the rest are published. Structural problems (deputy count, schema) still block the whole connector.
    const max = Number(process.env.CAMARA_MAX_DETAIL ?? 5000);
    const votes: VoteRecord[] = [];
    const quarantined: string[] = [];
    let withoutDetail = 0;
    for (const v of votaciones.slice(0, max)) {
      const snap = await fetchSnapshot(CAMARA_ENDPOINTS.votacionDetalle(v.Id), "camara");
      const these: VoteRecord[] = findArray(parseXml(snap.body), "Voto").map((x) => {
        const o = x as Record<string, unknown>;
        const dip = (o["Diputado"] ?? {}) as Record<string, unknown>;
        return { votacionId: v.Id, diputadoId: Number(dip["Id"]), ...parseOpcion(o["OpcionVoto"]) };
      });
      if (these.length === 0) {
        withoutDetail++; // e.g. votes without individual roll call; totals are still published in the list
      } else {
        const problem = reconcileVotes(v, these);
        if (problem) quarantined.push(problem);
        else votes.push(...these);
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    const checked = Math.min(max, votaciones.length);
    notes.push(`${checked - quarantined.length - withoutDetail} votaciones cuadradas con sus totales oficiales`);
    if (withoutDetail) notes.push(`${withoutDetail} sin votos individuales`);
    if (quarantined.length) notes.push(`${quarantined.length} en cuarentena por no cuadrar: ${quarantined.slice(0, 5).join(" | ")}`);
    // If most votes fail, the parser (not the data) is wrong: block everything.
    if (quarantined.length > Math.max(5, checked * 0.05)) issues.push(`${quarantined.length} de ${checked} votaciones no cuadran: probable cambio de formato.`);

    return {
      connector: this.id,
      facts,
      records: { diputados, votaciones, votos: votes, cuarentena: quarantined },
      issues,
      notes,
    };
  },
};
