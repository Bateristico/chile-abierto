/** Seats of the Cámara as a hemicycle, colored by party (largest first, left to right). Pure SVG, server-rendered. */
export interface SeatGroup {
  key: string;
  label: string;
  n: number;
  color: string;
}

export function Hemicycle({ groups, label, dark = false }: { groups: SeatGroup[]; label: string; dark?: boolean }) {
  const total = groups.reduce((a, g) => a + g.n, 0);
  if (!total) return null;
  const R = 200;
  const rows = total > 100 ? 8 : 6;
  const radii = Array.from({ length: rows }, (_, i) => R * (0.42 + (0.58 * i) / (rows - 1)));
  const sumR = radii.reduce((a, b) => a + b, 0);
  const perRow = radii.map((r) => Math.round((total * r) / sumR));
  perRow[rows - 1] += total - perRow.reduce((a, b) => a + b, 0);
  const seats: { x: number; y: number; a: number }[] = [];
  radii.forEach((r, i) => {
    const s = perRow[i];
    for (let j = 0; j < s; j++) {
      const a = Math.PI - (Math.PI * j) / Math.max(1, s - 1);
      seats.push({ x: R + 12 + r * Math.cos(a), y: R + 6 - r * Math.sin(a), a });
    }
  });
  seats.sort((p, q) => q.a - p.a);
  const colors = groups.flatMap((g) => Array.from({ length: g.n }, () => g.color));
  const seatR = rows === 8 ? 6.2 : 8;
  return (
    <svg viewBox={`0 0 ${2 * R + 24} ${R + 16}`} width="100%" role="img" aria-label={label} style={{ maxWidth: 460, display: "block" }}>
      {seats.map((s, i) => (
        <circle key={i} className="pop" style={{ animationDelay: `${0.2 + i * 0.006}s` }} cx={s.x.toFixed(1)} cy={s.y.toFixed(1)} r={seatR} fill={colors[i]} />
      ))}
      <text x={R + 12} y={R - 10} textAnchor="middle" fontFamily="Playfair Display, serif" fontWeight="800" fontSize="44" fill={dark ? "#fff" : "#16161D"}>
        {total}
      </text>
      <text x={R + 12} y={R + 10} textAnchor="middle" fontFamily="Public Sans, sans-serif" fontSize="13" fill={dark ? "#C9CAD3" : "#5E5F6B"}>
        escaños
      </text>
    </svg>
  );
}
