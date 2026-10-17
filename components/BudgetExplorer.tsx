"use client";

import { useEffect, useMemo, useState } from "react";
import { Prov } from "./Prov";
import type { ProvInfo } from "@/lib/provenance/view";
import { squarify } from "@/lib/budget/treemap";
import { fmtBillones, fmtClp, fmtPct } from "@/lib/format";

export interface PartidaView {
  slug: string;
  name: string;
  short: string;
  miles: number;
  varPct: number;
  amountProv: ProvInfo;
  varProv: ProvInfo;
}

type Unit = "total" | "persona-ano" | "persona-dia";

export function BudgetExplorer({ partidas, totalMiles, population }: { partidas: PartidaView[]; totalMiles: number; population: number }) {
  const [sel, setSel] = useState<string>("salud");
  // Static site: the selected partida comes from ?p= in the browser (e.g. links from the home receipt).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("p");
    if (p && partidas.some((x) => x.slug === p)) setSel(p);
  }, [partidas]);
  const [unit, setUnit] = useState<Unit>("total");
  const [tax, setTax] = useState(100000);
  const rects = useMemo(() => squarify(partidas.map((p) => ({ key: p.slug, value: p.miles })), 160, 100), [partidas]);
  const bySlug = useMemo(() => new Map(partidas.map((p) => [p.slug, p])), [partidas]);
  const s = bySlug.get(sel) ?? partidas[0];

  const amount = (miles: number) => {
    if (unit === "persona-ano") return `${fmtClp((miles * 1000) / population)} al año`;
    if (unit === "persona-dia") return `${fmtClp((miles * 1000) / population / 365)} al día`;
    return fmtBillones(miles);
  };
  const tone = (v: number) => (v > 0.05 ? "up" : v < -0.05 ? "down" : "flat");
  const share = (s.miles / totalMiles) * 100;
  const sortedByVar = [...partidas].sort((a, b) => b.varPct - a.varPct);
  const maxAbs = Math.max(...partidas.map((p) => Math.abs(p.varPct)));

  return (
    <>
      <div className="bar">
        <div className="bar-in">
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "999 1 360px" }}>
            <span className="tiny muted">Periodo</span>
            <span style={{ fontWeight: 700, minHeight: 40, display: "flex", alignItems: "center" }}>
              Proyecto de Ley de Presupuestos 2027
              <span className="tiny muted" style={{ fontWeight: 400, marginLeft: 8 }}>Los años anteriores se cargan con el conector de DIPRES.</span>
            </span>
          </div>
          <div role="group" aria-label="Mostrar en" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="tiny muted">Mostrar en</span>
            <span className="seg">
              {(
                [
                  ["total", "Total"],
                  ["persona-ano", "Por persona al año"],
                  ["persona-dia", "Por persona al día"],
                ] as [Unit, string][]
              ).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={unit === k} onClick={() => setUnit(k)}>
                  {l}
                </button>
              ))}
            </span>
          </div>
        </div>
      </div>

      <main className="wrap">
        <section style={{ display: "flex", flexWrap: "wrap", gap: "12px 40px", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ flex: "999 1 520px", display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="muted">32 partidas · sin Tesoro Público</span>
            <h1 style={{ fontSize: "clamp(28px, 6cqi, 44px)", lineHeight: 1.08, fontWeight: 800, letterSpacing: "-0.03em", maxWidth: "22ch" }}>
              {s.short} recibe {amount(s.miles)}: {fmtPct(share)} del gasto de los ministerios.
            </h1>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <span className="small muted">Total de las 32 partidas</span>
            <span className="bignum" style={{ fontSize: "clamp(30px, 6cqi, 40px)", lineHeight: 1.1 }}>{amount(totalMiles)}</span>
          </div>
        </section>

        <section className="row" style={{ alignItems: "stretch" }}>
          <div className="card" style={{ flex: "999 1 600px", minWidth: 0, padding: 22, gap: 14 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: 22 }}>Por partida</h2>
              <span className="tiny muted" style={{ display: "flex", gap: 14 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span className="up" style={{ width: 12, height: 12, borderRadius: 3 }} />sube en términos reales</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span className="down" style={{ width: 12, height: 12, borderRadius: 3 }} />baja</span>
              </span>
            </div>
            <div className="treemap" role="list" aria-label="Partidas por monto">
              {rects.map((r) => {
                const p = bySlug.get(r.key)!;
                const big = r.w * r.h > 120;
                const tiny = r.w < 5 || r.h < 7;
                return (
                  <button
                    key={r.key}
                    role="listitem"
                    type="button"
                    className={`tm-tile ${tone(p.varPct)}${sel === p.slug ? " sel" : ""}`}
                    style={{ left: `calc(${r.x}% + 2px)`, top: `calc(${r.y}% + 2px)`, width: `calc(${r.w}% - 4px)`, height: `calc(${r.h}% - 4px)`, padding: tiny ? 0 : undefined }}
                    onClick={() => setSel(p.slug)}
                    aria-pressed={sel === p.slug}
                    aria-label={`${p.name}: ${fmtBillones(p.miles)}, ${fmtPct(p.varPct, true)} real`}
                    title={`${p.name}: ${fmtBillones(p.miles)} (${fmtPct(p.varPct, true)})`}
                  >
                    {!tiny && (
                      <>
                        <span className="nm" style={{ fontSize: big ? 18 : 13 }}>{p.short}</span>
                        {r.h > 12 && r.w > 9 && <span style={{ fontSize: big ? 14 : 12 }}>{fmtBillones(p.miles)}</span>}
                        {r.h > 16 && r.w > 9 && <span style={{ fontSize: 12, fontWeight: 700 }}>{fmtPct(p.varPct, true)}</span>}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="tm-list" role="list" aria-label="Partidas por monto">
              {[...partidas].sort((a, b) => b.miles - a.miles).map((p) => (
                <button key={p.slug} role="listitem" type="button" className={`tm-row ${tone(p.varPct)}${sel === p.slug ? " sel" : ""}`} onClick={() => setSel(p.slug)} aria-pressed={sel === p.slug}>
                  <strong>{p.short}</strong>
                  <span className="small">{fmtBillones(p.miles)} · {fmtPct(p.varPct, true)}</span>
                  <span className="barline"><span style={{ display: "block", height: "100%", width: `${(p.miles / partidas[0].miles) * 100}%`, maxWidth: "100%", background: "currentColor", opacity: 0.35 }} /></span>
                </button>
              ))}
            </div>
            <p className="tiny muted">Las partidas muy pequeñas aparecen sin texto; tócalas o usa la lista de variaciones más abajo.</p>
          </div>

          <aside className="card" aria-labelledby="fname" style={{ flex: "1 1 340px", minWidth: 0, gap: 18 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="small muted">Partida</span>
              <h2 id="fname" style={{ fontSize: 28, lineHeight: 1.1, fontWeight: 800 }}>{s.name}</h2>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "18px 28px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="tiny muted">Propuesto para 2027</span>
                <span className="bignum" style={{ fontSize: 28 }}>{amount(s.miles)}</span>
                <Prov info={s.amountProv} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="tiny muted">Variación real</span>
                <span className="bignum" style={{ fontSize: 28, color: s.varPct >= 0 ? "var(--blue-deep)" : "var(--copper)" }}>{fmtPct(s.varPct, true)}</span>
                <Prov info={s.varProv} align="right" />
              </div>
            </div>
            <p className="small" style={{ color: "var(--ink-2)" }}>
              Es el {fmtPct(share)} del gasto de los ministerios: {fmtClp((s.miles * 1000) / population)} por persona al año, o {fmtClp((s.miles * 1000) / population / 365)} al día.
            </p>
            <details className="small" style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 10 }}>
              <summary style={{ fontWeight: 700, cursor: "pointer", minHeight: 32 }}>¿Contra qué se compara la variación?</summary>
              <p style={{ marginTop: 6, color: "var(--ink-2)" }}>
                Contra la base 2026 ajustada: Ley inicial 2026 más reajuste del sector público, leyes especiales y ajustes del año. Es la comparación que usa DIPRES; contra la ley
                original los porcentajes serían distintos.
              </p>
            </details>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <h3 style={{ fontSize: 16, fontFamily: "var(--font-body)", letterSpacing: 0 }}>Programas de esta partida</h3>
              <p className="small muted">Pendiente: el detalle por programa se carga desde los documentos de cada partida de DIPRES. No mostramos cifras hasta verificarlas.</p>
            </div>
          </aside>
        </section>

        <section className="row" style={{ alignItems: "stretch" }}>
          <div className="card" style={{ flex: "1 1 460px", minWidth: 0 }}>
            <div>
              <h2 style={{ fontSize: 26 }}>Qué sube y qué baja</h2>
              <p className="small" style={{ color: "var(--ink-2)" }}>Variación real de cada partida frente a 2026, de mayor alza a mayor baja.</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {sortedByVar.map((p) => (
                <button
                  key={p.slug}
                  type="button"
                  onClick={() => setSel(p.slug)}
                  className="reg-row"
                  aria-pressed={sel === p.slug}
                  style={{ border: 0, background: sel === p.slug ? "var(--blue-tint)" : "transparent", borderRadius: 8, padding: "4px 6px", cursor: "pointer", color: "var(--ink)", textAlign: "left", minHeight: 30 }}
                >
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.short}</span>
                  <span style={{ position: "relative", height: 10, display: "block" }}>
                    <span style={{ position: "absolute", left: "50%", top: -3, bottom: -3, width: 1, background: "var(--grey)" }} />
                    <span
                      style={{
                        position: "absolute",
                        top: 0,
                        height: 10,
                        borderRadius: 3,
                        background: p.varPct >= 0 ? "var(--blue)" : "var(--copper)",
                        left: p.varPct >= 0 ? "50%" : `${50 - (Math.abs(p.varPct) / maxAbs) * 50}%`,
                        width: `${(Math.abs(p.varPct) / maxAbs) * 50}%`,
                      }}
                    />
                  </span>
                  <span style={{ textAlign: "right", fontWeight: 700 }}>{fmtPct(p.varPct, true)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="card" style={{ flex: "1 1 380px", minWidth: 0, background: "var(--ink)", color: "#fff" }}>
            <div>
              <h2 style={{ fontSize: 26 }}>Tu propia boleta</h2>
              <p className="small" style={{ color: "#C9D0DA" }}>Escribe cuánto pagas al mes en impuestos y te mostramos cómo se reparte entre las partidas.</p>
            </div>
            <label htmlFor="tax" className="small" style={{ color: "#C9D0DA" }}>Pago mensual en pesos</label>
            <input
              id="tax"
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              value={tax}
              onChange={(e) => setTax(Math.max(0, Number(e.target.value) || 0))}
              style={{ minHeight: 56, borderRadius: 12, border: "1.5px solid var(--muted)", background: "#263040", color: "#fff", padding: "0 16px", fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700 }}
            />
            <div style={{ display: "flex", flexDirection: "column", fontFamily: "var(--font-mono)", fontSize: 14 }}>
              {[...partidas]
                .sort((a, b) => b.miles - a.miles)
                .slice(0, 6)
                .map((p) => (
                  <div key={p.slug} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "7px 0" }}>
                    <span>{p.short}</span>
                    <span className="leader" style={{ borderColor: "var(--muted)" }} aria-hidden="true" />
                    <span>{fmtClp((tax * p.miles) / totalMiles)}</span>
                  </div>
                ))}
            </div>
            <p className="tiny" style={{ color: "#9AA4B2" }}>Reparto proporcional al gasto de las 32 partidas. Los impuestos no se asignan a gastos específicos: es una forma de dimensionar.</p>
          </div>
        </section>
      </main>
    </>
  );
}
