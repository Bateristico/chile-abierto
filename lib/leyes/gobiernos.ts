/**
 * Governments tracked by the site. A Mensaje belongs to the government in office on its filing date.
 * Editorial input (who governs is public record, but the list is maintained by hand).
 */
export interface Gobierno {
  id: string;
  nombre: string;
  presidente: string;
  desde: string;
  hasta: string;
  fuente: { titulo: string; url: string };
}

export const GOBIERNOS: Gobierno[] = [
  {
    id: "kast-2026",
    nombre: "Gobierno 2026–2030",
    presidente: "José Antonio Kast",
    desde: "2026-03-11",
    hasta: "2030-03-10",
    fuente: { titulo: "CNN Chile · cambio de mando del 11 de marzo de 2026", url: "https://www.cnnchile.com/pais/cuando-asumira-jose-antonio-kast-presidencia-cambio-de-mando/" },
  },
];

export const GOBIERNO_ACTUAL = GOBIERNOS[0];

export function gobiernoOn(date: string): Gobierno | undefined {
  return GOBIERNOS.find((g) => g.desde <= date && date <= g.hasta);
}
