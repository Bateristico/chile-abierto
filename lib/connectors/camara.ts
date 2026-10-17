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

const valor = (x: unknown): string => {
  if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    return String(o["#text"] ?? o["@_Valor"] ?? "");
  }
  return String(x ?? "");
};

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

export interface VoteRecord {
  votacionId: number;
  diputadoId: number;
  opcion: string;
}

/** Reconciliation: individual votes must add up to the totals the Cámara publishes for the same vote. */
export function reconcileVotes(v: z.infer<typeof VotacionSchema>, votes: VoteRecord[]): string | null {
  const count = (re: RegExp) => votes.filter((x) => re.test(x.opcion)).length;
  const si = count(/^(si|sí|afirmativo|a favor)/i);
  const no = count(/^(no|en contra)/i);
  const abs = count(/abstenci/i);
  if (si !== v.TotalSi || no !== v.TotalNo || abs !== v.TotalAbstencion) {
    return `Votación ${v.Id}: votos individuales (sí ${si}, no ${no}, abst ${abs}) no cuadran con los totales publicados (sí ${v.TotalSi}, no ${v.TotalNo}, abst ${v.TotalAbstencion}).`;
  }
  return null;
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

    // Individual votes, capped to keep the public service healthy. Raise CAMARA_MAX_DETAIL for full backfills.
    const max = Number(process.env.CAMARA_MAX_DETAIL ?? 200);
    const votes: VoteRecord[] = [];
    for (const v of votaciones.slice(0, max)) {
      const snap = await fetchSnapshot(CAMARA_ENDPOINTS.votacionDetalle(v.Id), "camara");
      const these = findArray(parseXml(snap.body), "Voto").map((x) => {
        const o = x as Record<string, unknown>;
        const dip = (o["Diputado"] ?? {}) as Record<string, unknown>;
        return { votacionId: v.Id, diputadoId: Number(dip["Id"] ?? dip["DIPID"]), opcion: valor(o["OpcionVoto"] ?? o["Opcion"]) };
      });
      const problem = reconcileVotes(v, these);
      if (problem) issues.push(problem);
      else votes.push(...these);
      await new Promise((r) => setTimeout(r, 250));
    }
    return {
      connector: this.id,
      facts,
      records: { diputados, votaciones, votos: votes },
      issues,
      notes,
    };
  },
};
