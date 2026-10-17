import { z } from "zod";
import { fetchSnapshot } from "./http";
import type { Connector, ConnectorResult } from "./types";

/** ChileCompra Mercado Público API: purchase orders by day. Requires a free personal ticket. */
const BASE = "https://api.mercadopublico.cl/servicios/v1/publico";

export const OrdenesResponse = z.object({
  Cantidad: z.number(),
  FechaCreacion: z.string().optional(),
  Listado: z.array(z.object({ Codigo: z.string(), Nombre: z.string().optional(), CodigoEstado: z.number().optional() }).passthrough()),
});

/** ddmmaaaa as the API expects, in Chilean dates. */
export function mpDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}${mm}${d.getUTCFullYear()}`;
}

export const mercadoPublico: Connector = {
  id: "mercadopublico",
  description: "ChileCompra · órdenes de compra del día anterior (listado)",
  requires: ["MERCADOPUBLICO_TICKET"],
  async run(): Promise<ConnectorResult> {
    const day = new Date(Date.now() - 86_400_000);
    const url = `${BASE}/ordenesdecompra.json?fecha=${mpDate(day)}&ticket=${process.env.MERCADOPUBLICO_TICKET}`;
    const snap = await fetchSnapshot(url, "chilecompra");
    const res = OrdenesResponse.parse(JSON.parse(snap.body.toString("utf8")));
    const issues: string[] = [];
    if (res.Cantidad !== res.Listado.length) issues.push(`La API declara ${res.Cantidad} órdenes y entrega ${res.Listado.length}.`);
    return {
      connector: this.id,
      facts: [],
      records: { ordenes: res.Listado.map((o) => ({ ...o, fecha: mpDate(day) })) },
      issues,
      notes: [`${res.Listado.length} órdenes del ${mpDate(day)}`],
    };
  },
};
