import { DIAL, PROFUNDIDAD, type Profundidad } from "@/lib/leyes/labels";
import { STATUS_LABEL, type BillStatus } from "@/lib/leyes/types";

/** Five-step impact dial: a half ring with the level filled. */
export function ImpactDial({ nivel, size = 44, showLabel = true }: { nivel: number | null; size?: number; showLabel?: boolean }) {
  const r = size / 2 - 4;
  const cx = size / 2;
  const cy = size / 2 + 2;
  const seg = (i: number) => {
    const a0 = Math.PI + (i * Math.PI) / 5 + 0.05;
    const a1 = Math.PI + ((i + 1) * Math.PI) / 5 - 0.05;
    return `M${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A${r} ${r} 0 0 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)}`;
  };
  const label = nivel ? DIAL[nivel - 1] : "Sin datos";
  return (
    <span className="dial" title={`Impacto: ${label}`}>
      <svg width={size} height={size / 2 + 6} viewBox={`0 0 ${size} ${size / 2 + 6}`} aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <path key={i} d={seg(i)} fill="none" strokeWidth="6" strokeLinecap="round" stroke={nivel && i < nivel ? "var(--blue)" : "var(--line)"} />
        ))}
      </svg>
      {showLabel && <span>{nivel ? `Impacto ${label.toLowerCase()}` : "Impacto sin datos"}</span>}
    </span>
  );
}

export function StatusChip({ st }: { st: BillStatus }) {
  const cls = st === "ley" ? "chip law" : st === "tramite" ? "chip" : st === "rechazado" ? "chip bad" : "chip dead";
  return <span className={cls}>{STATUS_LABEL[st]}</span>;
}

export function DepthChip({ p, por }: { p: Profundidad | null; por: string | null }) {
  if (!p) return <span className="chip dead">Sin clasificar</span>;
  return (
    <span className={por === "ia" ? "chip ia" : "chip"} title={por === "ia" ? "Borrador IA, pendiente de revisión" : por === "regla" ? "Clasificada por una regla publicada" : "Revisada por un editor"}>
      {PROFUNDIDAD[p].label}
      {por === "ia" ? " · borrador IA" : ""}
    </span>
  );
}
