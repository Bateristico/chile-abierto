"use client";

import { useEffect, useState } from "react";
import { Prov } from "./Prov";
import type { ProvInfo } from "@/lib/provenance/view";
import type { Finding } from "@/lib/findings/rules";
import { STATUS_LABEL } from "@/lib/format";

const LEVEL: Record<string, number> = { oficial: 3, corroborado: 2, secundario: 1, ejemplo: 0, pendiente: 0 };

function Meter({ status }: { status: string }) {
  const lvl = LEVEL[status] ?? 0;
  return (
    <span aria-hidden="true" style={{ display: "inline-flex", gap: 3, alignItems: "flex-end" }}>
      {[1, 2, 3].map((i) => (
        <span key={i} style={{ width: 8, height: 6 + i * 4, borderRadius: 2, background: i <= lvl ? "var(--blue)" : "var(--line)" }} />
      ))}
    </span>
  );
}

export function FindingsExplorer({ findings, provs }: { findings: Finding[]; provs: Record<string, ProvInfo> }) {
  const crosses = [...new Set(findings.map((f) => f.cross))];
  const [filter, setFilter] = useState<string | null>(null);
  const [sel, setSel] = useState(findings[0]?.id);
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("f");
    if (f && findings.some((x) => x.id === f)) setSel(f);
  }, [findings]);
  const visible = findings.filter((f) => !filter || f.cross === filter);
  const s = findings.find((f) => f.id === sel) ?? findings[0];
  if (!s) return <p>No hay hallazgos todavía.</p>;

  return (
    <section className="row">
      <div style={{ flex: "1 1 380px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800 }}>Hallazgos</h1>
        <div role="group" aria-label="Filtrar" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <button type="button" className="pill" aria-pressed={filter === null} onClick={() => setFilter(null)}>Todos</button>
          {crosses.map((c) => (
            <button key={c} type="button" className="pill" aria-pressed={filter === c} onClick={() => setFilter(c)}>{c}</button>
          ))}
        </div>
        {visible.map((f) => (
          <button key={f.id} type="button" className="fcard" aria-pressed={sel === f.id} onClick={() => setSel(f.id)}>
            <span style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
              <span className="small" style={{ color: "var(--ink-2)" }}>{f.cross}</span>
              <span style={{ fontSize: 13, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: f.origin === "ejemplo" ? "#eceef1" : "var(--blue-tint)", color: f.origin === "ejemplo" ? "var(--ink-2)" : "var(--blue-deep)" }}>
                {f.origin === "ejemplo" ? "Ejemplo" : f.origin === "ia" ? "Propuesto por IA, verificado" : "Calculado con reglas"}
              </span>
            </span>
            <strong style={{ fontSize: 17, lineHeight: 1.35 }}>{f.title}</strong>
            <span className="small muted" style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <Meter status={f.status} />
              Nivel: {STATUS_LABEL[f.status].toLowerCase()}
            </span>
          </button>
        ))}
      </div>

      <article className="card" aria-labelledby="ftitle" style={{ flex: "1 1 560px", minWidth: 0, gap: 20 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <span style={{ color: "var(--ink-2)" }}>{s.cross}</span>
          {s.mentionsPeople && <span style={{ fontSize: 13, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "var(--copper-tint)", color: "var(--copper-deep)" }}>Coincidencia, no acusación</span>}
        </div>
        <h2 id="ftitle" style={{ fontSize: "clamp(23px, 5.4cqi, 30px)", lineHeight: 1.15, fontWeight: 800 }}>{s.title}</h2>
        <p style={{ fontSize: 17, color: "var(--ink-2)" }}>{s.summary}</p>

        <figure style={{ margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          <ol className="chain" aria-label="Cadena de evidencia">
            {s.chain.map((n, i) => (
              <li key={i}>
                <span className={`node${i === s.chain.length - 1 ? " last" : ""}`}>
                  <span className="tiny muted">{n.source}</span>
                  <strong>{n.label}</strong>
                  <span className="small" style={{ color: "var(--ink-2)" }}>{n.detail}</span>
                  {n.factId && provs[n.factId] && <span style={{ marginTop: 4 }}><Prov info={provs[n.factId]} /></span>}
                </span>
                {i < s.chain.length - 1 && (
                  <span className="edge">
                    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="#4A5566" strokeWidth="1.6" /></svg>
                    {s.edges[i] && <span>{s.edges[i]}</span>}
                  </span>
                )}
              </li>
            ))}
          </ol>
          <figcaption className="tiny muted">Cada caja es un dato con su fuente; ábrela para ver cómo se verificó.</figcaption>
        </figure>

        {s.origin === "ia" && (
          <p className="small" style={{ background: "var(--blue-tint)", borderRadius: 12, padding: "12px 14px", color: "var(--ink-2)" }}>
            <strong style={{ color: "var(--ink)" }}>Cómo se verificó:</strong> lo propuso un modelo de IA; cada cifra coincide con un dato verificado que cita, y un
            segundo modelo lo revisó contra esos datos{s.critic ? `: «${s.critic}»` : "."}
          </p>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <div style={{ flex: "1 1 250px", background: "var(--ground)", borderRadius: 14, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
            <strong>Otras explicaciones posibles</strong>
            <ul className="small" style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6, color: "var(--ink-2)" }}>
              {s.alternatives.map((a) => <li key={a}>{a}</li>)}
            </ul>
          </div>
          <div style={{ flex: "1 1 250px", background: "var(--ground)", borderRadius: 14, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
            <strong>Qué cambiaría esta conclusión</strong>
            <span className="small" style={{ color: "var(--ink-2)" }}>{s.wouldChange}</span>
          </div>
        </div>

        <details className="small">
          <summary style={{ fontWeight: 700, cursor: "pointer", minHeight: 32 }}>Todos los datos usados ({s.factIds.length})</summary>
          <ul style={{ margin: "8px 0 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
            {s.factIds.map((id) => provs[id] && (
              <li key={id} style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", borderTop: "1px solid var(--line-soft)", paddingTop: 8 }}>
                <span>{provs[id].label}: <strong>{provs[id].value}</strong></span>
                <Prov info={provs[id]} align="right" />
              </li>
            ))}
          </ul>
          {s.factIds.length === 0 && <p className="muted" style={{ marginTop: 6 }}>Hallazgo de ejemplo: no usa datos reales.</p>}
        </details>
      </article>
    </section>
  );
}
