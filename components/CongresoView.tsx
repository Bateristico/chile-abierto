"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Analysis } from "@/lib/congreso/analysis";

export interface PeriodView {
  id: number;
  nombre: string;
  analysis: Analysis;
  /** id → [name, party alias at the end of the period / today] */
  diputados: Record<number, [string, string]>;
  nombres: Record<string, string>;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function CongresoView({ periods, colors }: { periods: PeriodView[]; colors: Record<string, string> }) {
  const [pid, setPid] = useState(periods[0].id);
  const [focus, setFocus] = useState<string | null>(null);
  const P = periods.find((p) => p.id === pid)!;
  const a = P.analysis;
  const color = (alias: string) => colors[alias] ?? "#C9CAD3";
  const big = a.partidos.filter((p) => p.escanos >= 3 && p.alias !== "IND");
  const chamber = useMemo(() => {
    const xs = big.filter((p) => p.cohesion !== null);
    const seats = xs.reduce((s, p) => s + p.escanos, 0) || 1;
    return xs.reduce((s, p) => s + (p.cohesion ?? 0) * p.escanos, 0) / seats;
  }, [big]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div className="seg" role="group" aria-label="Periodo legislativo">
          {periods.map((p) => (
            <button key={p.id} type="button" aria-pressed={pid === p.id} onClick={() => { setPid(p.id); setFocus(null); }}>{p.nombre}</button>
          ))}
        </div>
        <span className="small muted">{a.votaciones.toLocaleString("es-CL")} votaciones en Sala · datos al {new Date(a.asOf + "T12:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" })}</span>
      </div>

      <PoliticalMap P={P} color={color} focus={focus} setFocus={setFocus} />

      <section className="row" style={{ alignItems: "stretch" }}>
        <Cohesion P={P} color={color} chamber={chamber} />
        <Agreement P={P} />
      </section>

      <Rebels P={P} color={color} />
    </div>
  );
}

function PoliticalMap({ P, color, focus, setFocus }: { P: PeriodView; color: (a: string) => string; focus: string | null; setFocus: (s: string | null) => void }) {
  const m = P.analysis.mapa;
  const W = 760, pad = 36;
  const spanY = Math.max(0.35, ...m.points.map((p) => Math.abs(p.y)));
  const H = Math.round(2 * pad + (W - 2 * pad) * spanY * 0.9);
  const X = (x: number) => W / 2 + x * (W / 2 - pad);
  const Y = (y: number) => H / 2 - (y / spanY) * (H / 2 - pad);
  const parties = P.analysis.partidos.filter((p) => p.escanos >= 3);
  const centroid = (alias: string) => {
    const pts = m.points.filter((pt) => P.diputados[pt.id]?.[1] === alias);
    if (!pts.length) return null;
    return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
  };
  return (
    <section className="card rise" aria-labelledby="mapa" style={{ gap: 14 }}>
      <span className="kicker">Mapa político estimado con los votos</span>
      <h2 id="mapa" className="sec-title">Dónde se ubica cada diputado según cómo vota</h2>
      <p className="small" style={{ color: "var(--ink-2)", maxWidth: "56em" }}>
        Cada punto es una persona. Quienes votan parecido quedan cerca. La posición se calcula solo con las {m.votaciones.toLocaleString("es-CL")} votaciones disputadas del
        periodo, sin saber de qué partido es nadie; los colores se agregan después. El eje horizontal resume {pct(m.varianza[0])} de las diferencias entre votos y el vertical,{" "}
        {pct(m.varianza[1])}.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="group" aria-label="Destacar un partido">
        {parties.map((p) => (
          <button key={p.alias} type="button" className="pill" aria-pressed={focus === p.alias} onClick={() => setFocus(focus === p.alias ? null : p.alias)} style={{ minHeight: 36, display: "inline-flex", gap: 6, alignItems: "center" }}>
            <i style={{ width: 10, height: 10, borderRadius: 5, background: color(p.alias), display: "inline-block" }} />{p.alias} {p.escanos}
          </button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Mapa político estimado a partir de las votaciones">
        <line x1={pad} x2={W - pad} y1={H / 2} y2={H / 2} stroke="var(--line)" />
        <line x1={W / 2} x2={W / 2} y1={pad} y2={H - pad} stroke="var(--line)" />
        {m.points.map((pt) => {
          const [name, party] = P.diputados[pt.id] ?? [String(pt.id), "SIN"];
          const dim = focus && party !== focus;
          return (
            <a key={pt.id} href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/diputados/?p=${P.id}&id=${pt.id}`}>
              <circle cx={X(pt.x)} cy={Y(pt.y)} r={focus === party ? 7 : 5.5} fill={color(party)} fillOpacity={dim ? 0.12 : 0.85} stroke="#fff" strokeWidth="1">
                <title>{`${name} (${party})`}</title>
              </circle>
            </a>
          );
        })}
        {(() => {
          // Party labels at their centroid, nudged so they don't sit on each other (largest parties placed first).
          const placed: { x: number; y: number }[] = [];
          return parties.map((p) => {
            const c = centroid(p.alias);
            if (!c || p.alias === "IND" || (focus && focus !== p.alias)) return null;
            const x = X(c.x);
            let y = Y(c.y) - 12;
            for (const dy of [0, -18, 18, -36, 36, -54, 54]) {
              const yy = Y(c.y) - 12 + dy;
              if (!placed.some((q) => Math.abs(q.x - x) < 44 && Math.abs(q.y - yy) < 16)) { y = yy; break; }
            }
            placed.push({ x, y });
            return (
              <text key={p.alias} x={x} y={y} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--ink)" stroke="var(--surface)" strokeWidth="4" paintOrder="stroke">
                {p.alias}
              </text>
            );
          });
        })()}
      </svg>
      <details className="small">
        <summary style={{ fontWeight: 700, cursor: "pointer", minHeight: 32 }}>Cómo leer este mapa · qué no dice</summary>
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6, color: "var(--ink-2)" }}>
          <li>Se usan solo votaciones disputadas (al menos 2,5% del lado perdedor); las unánimes no separan a nadie.</li>
          <li>A favor vale 1, en contra −1 y abstención 0. La posición son los dos componentes principales de esa matriz.</li>
          <li>Los ejes no significan «izquierda» o «derecha» por definición: muestran lo que más separa los votos. El partido más grande queda siempre a la derecha y arriba para que el mapa no se invierta de un día a otro.</li>
          <li>Quedan fuera quienes votaron en menos del 20% de las votaciones disputadas (por ejemplo, reemplazos breves).</li>
        </ul>
      </details>
    </section>
  );
}

function Cohesion({ P, color, chamber }: { P: PeriodView; color: (a: string) => string; chamber: number }) {
  const rows = P.analysis.partidos.filter((p) => p.escanos >= 3 && p.cohesion !== null && p.alias !== "IND").sort((a, b) => (b.cohesion ?? 0) - (a.cohesion ?? 0));
  const years = Object.keys(P.analysis.cohesionAnual[rows[0]?.alias] ?? {}).sort();
  return (
    <div className="card rise d1" style={{ flex: "1 1 400px", minWidth: 0, gap: 14 }}>
      <span className="kicker">Cohesión</span>
      <h2 className="sec-title" style={{ fontSize: "clamp(22px, 4cqi, 28px)" }}>Qué tan unido vota cada partido</h2>
      <p className="small" style={{ color: "var(--ink-2)" }}>Índice de acuerdo: 100% si todos sus diputados votan igual, 0% si se reparten en tres partes iguales. La línea es el promedio de los partidos ({pct(chamber)}). Los independientes no se muestran: no votan como grupo.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, position: "relative" }}>
        {rows.map((p, i) => (
          <div key={p.alias} style={{ display: "grid", gridTemplateColumns: "56px minmax(0, 1fr) 44px", gap: 10, alignItems: "center", fontSize: 13 }}>
            <strong title={P.nombres[p.alias]}>{p.alias}</strong>
            <span style={{ position: "relative", height: 14, background: "var(--ground)", borderRadius: 7 }}>
              <span className={`grow d${(i % 8) + 1}`} style={{ position: "absolute", inset: 0, width: `${(p.cohesion ?? 0) * 100}%`, background: color(p.alias), borderRadius: 7 }} />
              <span style={{ position: "absolute", left: `${chamber * 100}%`, top: -3, bottom: -3, width: 2, background: "var(--ink)" }} />
            </span>
            <span style={{ textAlign: "right", fontWeight: 700 }}>{pct(p.cohesion ?? 0)}</span>
          </div>
        ))}
      </div>
      {years.length > 1 && (
        <details className="small">
          <summary style={{ fontWeight: 700, cursor: "pointer", minHeight: 32 }}>Año por año</summary>
          <table className="ledger" style={{ fontSize: 12 }}>
            <thead><tr><th>Partido</th>{years.map((y) => <th key={y}>{y}</th>)}</tr></thead>
            <tbody>{rows.map((p) => <tr key={p.alias}><td>{p.alias}</td>{years.map((y) => <td key={y}>{P.analysis.cohesionAnual[p.alias]?.[y] ? pct(P.analysis.cohesionAnual[p.alias][y].cohesion) : "—"}</td>)}</tr>)}</tbody>
          </table>
        </details>
      )}
    </div>
  );
}

function Agreement({ P }: { P: PeriodView }) {
  const parties = P.analysis.partidos.filter((p) => p.escanos >= 3 && p.alias !== "IND").map((p) => p.alias);
  const share = (a: string, b: string) => {
    if (a === b) return null;
    const x = P.analysis.acuerdo.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
    return x ? x.share : null;
  };
  const fill = (s: number | null) => (s === null ? "var(--ground)" : `rgba(59, 52, 134, ${Math.max(0.06, (s - 0.3) / 0.7)})`);
  return (
    <div className="card rise d2" style={{ flex: "1 1 400px", minWidth: 0, gap: 14 }}>
      <span className="kicker">Bloques</span>
      <h2 className="sec-title" style={{ fontSize: "clamp(22px, 4cqi, 28px)" }}>Quién vota con quién</h2>
      <p className="small" style={{ color: "var(--ink-2)" }}>Porcentaje de votaciones en que la mayoría de un partido votó igual que la mayoría del otro.</p>
      <div className="grid-wrap">
        <table className="bgrid" style={{ minWidth: 0 }}>
          <thead><tr><th />{parties.map((p) => <th key={p} scope="col">{p}</th>)}</tr></thead>
          <tbody>
            {parties.map((a) => (
              <tr key={a}>
                <th scope="row" className="rowh">{a}</th>
                {parties.map((b) => {
                  const s = share(a, b);
                  return (
                    <td key={b}>
                      <span className="cell" style={{ display: "flex", alignItems: "center", justifyContent: "center", minWidth: 38, height: 30, borderRadius: 6, fontSize: 11, fontWeight: 700, background: fill(s), color: s !== null && s > 0.75 ? "#fff" : "var(--ink)" }} title={s === null ? "" : `${a} y ${b}: ${pct(s)}`}>
                        {s === null ? "" : Math.round(s * 100)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Rebels({ P, color }: { P: PeriodView; color: (a: string) => string }) {
  const rows = P.analysis.diputados
    .filter((d) => d.comparables >= 50)
    .map((d) => ({ ...d, line: d.conPartido / d.comparables, name: P.diputados[d.id]?.[0] ?? String(d.id), party: P.diputados[d.id]?.[1] ?? "" }));
  if (!rows.length) return null;
  const bins = Array.from({ length: 13 }, (_, i) => 0.7 + i * 0.025);
  const hist = bins.map((b, i) => rows.filter((r) => r.line >= b && (i === bins.length - 1 ? r.line <= 1 : r.line < b + 0.025)).length);
  const below = rows.filter((r) => r.line < 0.7).length;
  const max = Math.max(...hist, below, 1);
  const low = [...rows].sort((a, b) => a.line - b.line).slice(0, 8);
  const median = [...rows].sort((a, b) => a.line - b.line)[Math.floor(rows.length / 2)].line;
  return (
    <section className="card rise d3" aria-labelledby="disc" style={{ gap: 14 }}>
      <span className="kicker">Disciplina</span>
      <h2 id="disc" className="sec-title">La mayoría vota con su partido; algunos se apartan seguido</h2>
      <p className="small" style={{ color: "var(--ink-2)", maxWidth: "56em" }}>
        Porcentaje de votaciones en que cada diputado votó igual que la mayoría de los demás miembros de su partido (sin contar su propio voto). La mitad está sobre {pct(median)}.
        Se incluye a quienes tienen al menos 50 votaciones comparables; los independientes no tienen partido con el cual comparar.
      </p>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 140 }} aria-label="Distribución de la disciplina partidaria">
        <span title={`Menos de 70%: ${below}`} style={{ flex: 1, height: `${(below / max) * 100}%`, background: "var(--copper-fill)", borderRadius: "4px 4px 0 0", minHeight: below ? 3 : 0 }} />
        {hist.map((h, i) => <span key={i} className="growY" title={`${pct(bins[i])}–${pct(bins[i] + 0.025)}: ${h}`} style={{ flex: 1, height: `${(h / max) * 100}%`, background: "var(--blue)", opacity: 0.35 + (i / hist.length) * 0.65, borderRadius: "4px 4px 0 0", minHeight: h ? 3 : 0 }} />)}
      </div>
      <div className="tiny muted" style={{ display: "flex", justifyContent: "space-between" }}><span>menos de 70%</span><span>85%</span><span>100% con su partido</span></div>
      <h3 style={{ fontSize: 17, fontFamily: "var(--font-body)" }}>Quienes más se apartan</h3>
      <div className="scroll-x">
        <table className="ledger">
          <thead><tr><th>Diputado</th><th>Partido</th><th>Con su partido</th><th>Votaciones comparables</th></tr></thead>
          <tbody>
            {low.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/diputados?p=${P.id}&id=${r.id}`}>{r.name}</Link></td>
                <td><span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><i style={{ width: 8, height: 8, borderRadius: 4, background: color(r.party), display: "inline-block" }} />{r.party}</span></td>
                <td style={{ fontWeight: 700 }}>{pct(r.line)}</td>
                <td>{r.comparables.toLocaleString("es-CL")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tiny muted">Apartarse no es bueno ni malo: puede ser independencia, un cambio de partido en curso o una postura distinta en un tema. Revisa sus votaciones para ver dónde.</p>
    </section>
  );
}
