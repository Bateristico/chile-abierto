import type { Analysis } from "./analysis";

const PALETTE = ["#3B3486", "#E0584E", "#2E8A7A", "#D9A12B", "#8C83D9", "#5B9BD5", "#B5567A", "#7A8B3A", "#C47A2C", "#4F6D7A", "#9C6ADE", "#3F8F5A"];

/** One colour per party across periods (by size, most recent period first); independents grey. Neutral, not party branding. */
export function partyColors(analyses: Analysis[]): Record<string, string> {
  const colors: Record<string, string> = { IND: "#9A9BA6" };
  let k = 0;
  for (const a of [...analyses].sort((x, y) => y.periodo - x.periodo)) for (const p of a.partidos) if (!(p.alias in colors)) colors[p.alias] = PALETTE[k++ % PALETTE.length];
  return colors;
}
