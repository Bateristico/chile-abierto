/** Flat pastel illustrations and topic icons. Decorative: always aria-hidden. */

export const PALETTE = ["#3B3486", "#E0584E", "#2E8A7A", "#D9A12B", "#8C83D9", "#5B9BD5", "#C9CAD3"];
/** Text color that reads on each PALETTE fill. */
export const PALETTE_INK = ["#FFFFFF", "#16161D", "#FFFFFF", "#16161D", "#16161D", "#16161D", "#16161D"];

export const TOPICS: Record<string, { tint: string; ink: string; icon: string }> = {
  presupuesto: { tint: "#DCF1EA", ink: "#1E5F52", icon: "M4 20h16M7 20V12M12 20V7M17 20V4" },
  deuda: { tint: "#FDF0D5", ink: "#8A5A00", icon: "M12 3v18M17 7H9.5a3 3 0 000 6h5a3 3 0 010 6H7" },
  regiones: { tint: "#E7E5FA", ink: "#3B3486", icon: "M3 20h18M5 20V9l7-5 7 5v11M9 20v-6h6v6" },
  congreso: { tint: "#DDEBFA", ink: "#24507F", icon: "M4 7h16v13H4zM9 7V4h6v3M9 13l2 2 4-4" },
  lobby: { tint: "#FCE4E2", ink: "#B5362E", icon: "M4 5h16v11H8l-4 4z" },
  salud: { tint: "#DCF1EA", ink: "#1E5F52", icon: "M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z" },
  ia: { tint: "#E7E5FA", ink: "#3B3486", icon: "M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.2-5.4 3.2 1.3-6L3.3 9.2l6.1-.6z" },
  ejemplo: { tint: "#F1F2F5", ink: "#5E5F6B", icon: "M5 5h14v14H5zM9 9h6M9 13h6" },
};

/** Pick a topic look from a finding's «cross» label and origin. */
export function topicOf(cross: string, origin?: string) {
  if (origin === "ejemplo") return TOPICS.ejemplo;
  const c = cross.toLowerCase();
  if (c.includes("deuda")) return TOPICS.deuda;
  if (c.includes("region")) return TOPICS.regiones;
  if (c.includes("lobby") || c.includes("aporte")) return TOPICS.lobby;
  if (c.includes("voto") || c.includes("congreso") || c.includes("cámara")) return TOPICS.congreso;
  if (origin === "ia") return TOPICS.ia;
  return TOPICS.presupuesto;
}

export function TopicIcon({ topic, size = 36 }: { topic: { ink: string; icon: string }; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={topic.ink} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={topic.icon} />
    </svg>
  );
}

/** Hero: a public building with a stack of coins. */
export function HeroArt() {
  return (
    <svg className="float art" width="260" height="240" viewBox="0 0 260 240" aria-hidden="true" style={{ flex: "1 1 220px", maxWidth: 260 }}>
      <circle cx="130" cy="120" r="104" fill="#2A2A35" />
      <rect x="58" y="150" width="144" height="16" rx="4" fill="#3B3486" />
      {[66, 94, 122, 150, 178].map((x) => (
        <rect key={x} x={x} y="96" width="14" height="54" rx="3" fill="#E7E5FA" />
      ))}
      <path d="M54 92 L130 52 L206 92 Z" fill="#FCE4E2" />
      <circle cx="130" cy="76" r="8" fill="#E0584E" />
      <ellipse cx="196" cy="178" rx="30" ry="9" fill="#D9A12B" />
      <rect x="166" y="160" width="60" height="18" fill="#D9A12B" />
      <ellipse cx="196" cy="160" rx="30" ry="9" fill="#F3C969" />
      <ellipse cx="196" cy="152" rx="30" ry="9" fill="#D9A12B" />
      <rect x="166" y="134" width="60" height="18" fill="#D9A12B" />
      <ellipse cx="196" cy="134" rx="30" ry="9" fill="#F3C969" />
      <text x="196" y="139" textAnchor="middle" fontFamily="Playfair Display, serif" fontWeight="800" fontSize="14" fill="#7A5410">$</text>
      <circle cx="48" cy="58" r="5" fill="#FF8A80" />
      <circle cx="222" cy="70" r="4" fill="#7FD1BE" />
      <circle cx="40" cy="190" r="3" fill="#8C83D9" />
    </svg>
  );
}

/** Lead story art: rising bars with a check. */
export function BarsArt() {
  return (
    <svg className="float" width="300" height="200" viewBox="0 0 300 200" aria-hidden="true">
      <rect x="40" y="150" width="220" height="10" rx="5" fill="#F6C1BC" />
      <rect className="growY d2" x="70" y="110" width="34" height="40" rx="6" fill="#E7E5FA" />
      <rect className="growY d3" x="133" y="70" width="34" height="80" rx="6" fill="#3B3486" />
      <rect className="growY d4" x="196" y="40" width="34" height="110" rx="6" fill="#E0584E" />
      <circle cx="213" cy="24" r="14" fill="#fff" stroke="#E0584E" strokeWidth="3" />
      <path d="M206 24l5 5 9-10" fill="none" stroke="#E0584E" strokeWidth="3" strokeLinecap="round" />
      <circle cx="56" cy="60" r="6" fill="#D9A12B" />
      <circle cx="260" cy="96" r="4" fill="#2E8A7A" />
    </svg>
  );
}
