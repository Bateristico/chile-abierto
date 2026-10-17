import { z } from "zod";
import { fetchSnapshot } from "./http";
import type { Connector, ConnectorResult } from "./types";

/** Banco Central de Chile BDE REST API. Used for CPI (real-peso conversion) and macro context for the agents. */
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

export function parseBdeObs(obs: { indexDateString: string; value: string; statusCode: string }[]) {
  return obs
    .filter((o) => o.statusCode === "OK" && o.value !== "NaN")
    .map((o) => {
      const [d, m, y] = o.indexDateString.split("-");
      return { date: `${y}-${m}-${d}`, value: Number(o.value) };
    });
}

export const bcch: Connector = {
  id: "bcch",
  description: "Banco Central · IPC mensual para convertir a pesos reales",
  requires: ["BCCH_USER", "BCCH_PASS"],
  async run({ year }): Promise<ConnectorResult> {
    const series = process.env.BCCH_CPI_SERIES || "F074.IPC.IND.Z.EP23.C.M";
    const params = new URLSearchParams({
      user: process.env.BCCH_USER!,
      pass: process.env.BCCH_PASS!,
      firstdate: "2016-01-01",
      lastdate: `${year}-12-31`,
      timeseries: series,
      function: "GetSeries",
    });
    const snap = await fetchSnapshot(`${BASE}?${params}`, "bcch");
    const res = BdeResponse.parse(JSON.parse(snap.body.toString("utf8")));
    const issues: string[] = [];
    if (res.Codigo !== 0) issues.push(`El BDE respondió con código ${res.Codigo}: ${res.Descripcion}`);
    const obs = parseBdeObs(res.Series.Obs ?? []);
    if (obs.length < 12) issues.push(`Muy pocas observaciones de IPC (${obs.length}); revisar el código de serie ${series}.`);
    // Never store the credentials that were in the URL.
    return { connector: this.id, facts: [], records: { ipc: obs.map((o) => ({ ...o, series })) }, issues, notes: [`${obs.length} meses de IPC (${series})`] };
  },
};
