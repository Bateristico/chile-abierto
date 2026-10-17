import Link from "next/link";
import { budgetGrid, support, proponente } from "@/lib/congreso/budget-votes";
import type { CongresoData } from "@/lib/congreso/types";

/** Diverging fill: indigo for support, coral for opposition, strength by distance from an even split. */
function cellStyle(s: number | null) {
  if (s === null) return { background: "var(--ground)", color: "var(--muted)" };
  const d = Math.abs(s - 0.5) * 2;
  const color = s >= 0.5 ? "59, 52, 134" : "224, 88, 78";
  return { background: `rgba(${color}, ${0.12 + 0.78 * d})`, color: d > 0.45 && s >= 0.5 ? "#fff" : "var(--ink)" };
}

/**
 * How each party voted the budget bill in the Cámara, partida by partida. Shows the 2027 bill once the Sala has voted it,
 * the 2026 law (the most recent complete vote) until then.
 */
export function BudgetVoteGrid({ data, compact = false }: { data: CongresoData; compact?: boolean }) {
  const g27 = budgetGrid(data, "18702-05", 2027);
  const g = g27 ?? budgetGrid(data, "17870-05", 2026);
  if (!g) return null;
  const pid = data.periodos.find((p) => p.nombre === g.periodo)?.id;
  const filas = compact ? g.filas.filter((f) => f.partida !== null).slice(0, 12) : g.filas;
  const proposers = new Map<string, number>();
  for (const f of g.filas) for (const v of f.votos) {
    const p = proponente(v.art);
    if (p) proposers.set(p === "Ejecutivo" || p === "Senado" || p === "Comisión Mixta" ? p : "Diputados", (proposers.get(p === "Ejecutivo" || p === "Senado" || p === "Comisión Mixta" ? p : "Diputados") ?? 0) + 1);
  }
  return (
    <section className="card rise" aria-labelledby="bvg" style={{ gap: 18 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="kicker">El presupuesto en la Cámara · votación por partida</span>
        <h2 id="bvg" className="sec-title">
          {g27 ? "Así está votando la Cámara el Presupuesto 2027" : "Así votó la Cámara el Presupuesto 2026, partida por partida"}
        </h2>
        <p className="small" style={{ color: "var(--ink-2)", maxWidth: "54em" }}>
          {g.votaciones} votaciones en Sala del boletín {g.boletin}, agrupadas por la partida que cita cada una. Cada celda es el apoyo del partido: votos a favor sobre
          votos emitidos (a favor, en contra y abstención) en todas las votaciones de esa partida. {g27 ? "Se actualiza cada mañana." : "El Proyecto 2027 aún no se vota en la Sala de la Cámara; esta tabla cambiará sola cuando empiece."}
        </p>
      </div>
      <div className="grid-wrap">
        <table className="bgrid">
          <thead>
            <tr>
              <th scope="col" style={{ textAlign: "left" }}>Partida</th>
              <th scope="col">Votos</th>
              {g.partidos.map((p) => <th key={p} scope="col">{p}</th>)}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.key}>
                <th scope="row" className="rowh">{f.partida !== null ? `${String(f.partida).padStart(2, "0")} · ` : ""}{f.nombre}</th>
                <td className="tiny muted" style={{ textAlign: "center" }}>{f.votos.length}</td>
                {g.partidos.map((p) => {
                  const s = support(f.porPartido[p]);
                  const x = f.porPartido[p];
                  return (
                    <td key={p}>
                      <Link
                        className="cell"
                        style={cellStyle(s)}
                        href={`/votaciones?p=${pid}&b=${g.boletin}${f.partida !== null ? `&partida=${f.partida}` : ""}&partido=${encodeURIComponent(p)}`}
                        title={x ? `${p} en ${f.nombre}: ${x.favor} a favor, ${x.contra} en contra, ${x.abst} abstenciones en ${f.votos.length} votaciones` : `${p}: sin votos`}
                      >
                        {s === null ? "—" : `${Math.round(s * 100)}%`}
                      </Link>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="tiny" style={{ display: "flex", gap: 16, flexWrap: "wrap", color: "var(--ink-2)", alignItems: "center" }}>
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><i style={{ width: 28, height: 12, borderRadius: 4, display: "inline-block", background: "rgba(59,52,134,.9)" }} />Apoyó</span>
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><i style={{ width: 28, height: 12, borderRadius: 4, display: "inline-block", background: "rgba(224,88,78,.9)" }} />Se opuso</span>
        <span>Período {g.periodo}; partidos con 3 o más diputados. Toca una celda para ver esas votaciones.</span>
        {proposers.size > 0 && <span>Indicaciones votadas: {[...proposers.entries()].map(([k, n]) => `${k} ${n}`).join(" · ")}.</span>}
      </div>
      {compact && (
        <span><Link href="/presupuesto#votacion" className="btn">Ver las {g.filas.length} filas</Link></span>
      )}
    </section>
  );
}
