import { z } from "zod";
import { fetchSnapshot } from "./http";
import type { Connector, ConnectorResult } from "./types";

/**
 * Banco Central de Chile BDE REST API. Used for CPI (real-peso conversion) and macro context for the agents.
 * Docs: https://si3.bcentral.cl/estadisticas/Principal1/Web_Services/documentacion.html
 * Auth: API Key Token (BCCH_TOKEN, from «Mi Cuenta → Apikey Token», valid one year) or the BDE email and password
 * (BCCH_USER / BCCH_PASS), which the bank still accepts. Limit: 5 series per second per account.
 */
const BASE = "https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx";

export const BdeResponse = z.object({
  Codigo: z.number(),
  Descripcion: z.string(),
  Series: z.object({
    descripEsp: z.string().nullable().optional(),
    seriesId: z.string().nullable().optional(),
    Obs: z.array(z.object({ indexDateString: z.string(), value: z.string(), statusCode: z.string() })).nullable(),
  }),
});

export const BdeSearch = z.object({
  Codigo: z.number(),
  Descripcion: z.string(),
  SeriesInfos: z
    .array(z.object({ seriesId: z.string(), spanishTitle: z.string().nullable().optional(), lastObservation: z.string().nullable().optional() }).passthrough())
    .nullable(),
});

export function parseBdeObs(obs: { indexDateString: string; value: string; statusCode: string }[]) {
  return obs
    .filter((o) => o.statusCode === "OK" && o.value !== "NaN")
    .map((o) => {
      const [d, m, y] = o.indexDateString.split("-");
      return { date: `${y}-${m}-${d}`, value: Number(o.value) };
    });
}

/**
 * Pick the monthly general CPI index from the BDE catalogue: an F074.IPC.IND series whose title says «general»,
 * preferring the most recent base year (EPyy). Returns all candidates so the choice is auditable.
 */
export function pickCpiSeries(infos: { seriesId: string; spanishTitle?: string | null }[]) {
  const candidates = infos.filter((s) => /^F074\.IPC\.IND\./.test(s.seriesId) && /general/i.test(s.spanishTitle ?? ""));
  const base = (id: string) => Number(id.match(/\.EP(\d{2})\./)?.[1] ?? -1);
  const sorted = [...candidates].sort((a, b) => base(b.seriesId) - base(a.seriesId));
  return { chosen: sorted[0]?.seriesId as string | undefined, candidates: sorted.map((s) => `${s.seriesId} (${s.spanishTitle})`) };
}

function auth(): Record<string, string> {
  if (process.env.BCCH_TOKEN) return { token: process.env.BCCH_TOKEN };
  return { user: process.env.BCCH_USER!, pass: process.env.BCCH_PASS! };
}

export const bcch: Connector = {
  id: "bcch",
  description: "Banco Central · IPC mensual para convertir a pesos reales",
  requiresAnyOf: [["BCCH_TOKEN"], ["BCCH_USER", "BCCH_PASS"]],
  async run({ year }): Promise<ConnectorResult> {
    const issues: string[] = [];
    const notes: string[] = [];

    let series = process.env.BCCH_CPI_SERIES;
    if (!series) {
      const q = new URLSearchParams({ ...auth(), function: "SearchSeries", frequency: "MONTHLY" });
      const snap = await fetchSnapshot(`${BASE}?${q}`, "bcch");
      const res = BdeSearch.parse(JSON.parse(snap.body.toString("utf8")));
      if (res.Codigo !== 0) throw new Error(`El BDE respondió con código ${res.Codigo}: ${res.Descripcion}`);
      const pick = pickCpiSeries(res.SeriesInfos ?? []);
      if (!pick.chosen) throw new Error("No se encontró una serie de IPC general en el catálogo mensual; definir BCCH_CPI_SERIES.");
      series = pick.chosen;
      notes.push(`Serie elegida del catálogo: ${pick.candidates.slice(0, 4).join(" · ")}`);
      await new Promise((r) => setTimeout(r, 400)); // stay under 5 series/second
    }

    const params = new URLSearchParams({ ...auth(), firstdate: "2016-01-01", lastdate: `${year}-12-31`, timeseries: series, function: "GetSeries" });
    const snap = await fetchSnapshot(`${BASE}?${params}`, "bcch");
    const res = BdeResponse.parse(JSON.parse(snap.body.toString("utf8")));
    if (res.Codigo !== 0) issues.push(`El BDE respondió con código ${res.Codigo}: ${res.Descripcion}`);
    const obs = parseBdeObs(res.Series.Obs ?? []);
    if (obs.length < 12) issues.push(`Muy pocas observaciones de IPC (${obs.length}); revisar el código de serie ${series}.`);
    notes.unshift(`${obs.length} meses de IPC (${series}${res.Series.descripEsp ? `: ${res.Series.descripEsp}` : ""})`);
    // The URL in the snapshot is already redacted (token/user/pass), so no credentials reach the store.
    return { connector: this.id, facts: [], records: { ipc: obs.map((o) => ({ ...o, series })) }, issues, notes };
  },
};
