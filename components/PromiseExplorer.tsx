"use client";

import { useState } from "react";
import { Prov } from "./Prov";
import type { ProvInfo } from "@/lib/provenance/view";
import { fmtDate } from "@/lib/format";

type StatusKey = "c" | "u" | "e" | "i" | "n";
const ST: Record<StatusKey, { label: string; bg: string; fg: string; ring: string }> = {
  c: { label: "Cumplida", bg: "#3B3486", fg: "#fff", ring: "#3B3486" },
  u: { label: "En curso", bg: "#B9B3EE", fg: "#16161D", ring: "#B9B3EE" },
  e: { label: "Estancada", bg: "#9A9BA6", fg: "#16161D", ring: "#9A9BA6" },
  i: { label: "Incumplida", bg: "#B5362E", fg: "#fff", ring: "#B5362E" },
  n: { label: "Aún no se puede evaluar", bg: "#fff", fg: "#16161D", ring: "#9A9BA6" },
};
const ORDER: StatusKey[] = ["c", "u", "e", "i", "n"];
const TONE: Record<string, [string, string, string, string]> = {
  "a favor": ["#3B3486", "#E7E5FA", "#3B3486", "Va en línea con la promesa"],
  "en contra": ["#E0584E", "#FCE4E2", "#8E2B24", "Va en contra de la promesa"],
  contexto: ["#9A9BA6", "#F1F2F5", "#3F3F4A", "Contexto, no es un voto"],
};

export interface PromiseData {
  person: {
    name: string;
    initials: string;
    role: string;
    consistency: { aligned: number; total: number; chamberAverage: number };
    coverage: number;
    absences: { person: number; chamber: number };
    againstCaucus: { total: number; onPromises: number };
    termStart: string;
    termEnd: string;
  };
  topics: { id: string; name: string; statuses: string }[];
  promises: { id: string; topic: string; type: string; status: StatusKey; page: number; quote: string; why: string; evidence: { date: string; kind: string; align: string; text: string; extra: string }[] }[];
  caucuses: [string, number][];
}

const dot = (k: StatusKey, size: number) => ({ display: "inline-block", width: size, height: size, borderRadius: "50%", background: ST[k].bg, boxShadow: `inset 0 0 0 2px ${ST[k].ring}` });
const pill = (k: StatusKey) => ({ fontSize: 13, fontWeight: 700, padding: "4px 12px", borderRadius: 999, background: ST[k].bg, color: ST[k].fg, boxShadow: `inset 0 0 0 1.5px ${ST[k].ring}`, whiteSpace: "nowrap" as const });

export function PromiseExplorer({ data, demoProv }: { data: PromiseData; demoProv: ProvInfo }) {
  const [topic, setTopic] = useState<string | null>(null);
  const [sel, setSel] = useState<string>(data.promises[2]?.id ?? data.promises[0].id);
  const p = data.person;
  const pct = Math.round((p.consistency.aligned / p.consistency.total) * 100);
  const start = Date.parse(p.termStart);
  const end = Date.parse(p.termEnd);
  const now = Math.min(Date.now(), end);
  const elapsed = ((now - start) / (end - start)) * 100;
  const monthsDone = Math.round((now - start) / (30.44 * 86_400_000));
  const monthsTotal = Math.round((end - start) / (30.44 * 86_400_000));
  const totals = Object.fromEntries(ORDER.map((k) => [k, data.topics.reduce((a, t) => a + t.statuses.split("").filter((x) => x === k).length, 0)])) as Record<StatusKey, number>;
  const allCount = data.topics.reduce((a, t) => a + t.statuses.length, 0);
  const visible = data.promises.filter((x) => !topic || x.topic === topic);
  const selected = data.promises.find((x) => x.id === sel) ?? data.promises[0];
  const marks = data.promises.flatMap((x) => x.evidence.filter((e) => e.align === "a favor" || e.align === "en contra").map((e) => ({ ...e, left: ((Date.parse(e.date) - start) / (end - start)) * 100 })));
  const topicName = topic ? data.topics.find((t) => t.id === topic)?.name : null;
  const circ = 2 * Math.PI * 46;

  return (
    <main className="wrap">
      <div style={{ background: "#FDF0D5", border: "1px solid #F3D38A", borderRadius: 12, padding: "12px 16px", display: "flex", flexWrap: "wrap", gap: "8px 16px", alignItems: "center", justifyContent: "space-between", color: "#8A5A00" }}>
        <span className="small">
          <strong>Persona y datos de ejemplo.</strong> Esta vista se llena con las votaciones reales de la Cámara y con promesas cuya cita se verificó textual en el
          programa original, cuando corren los conectores.
        </span>
        <Prov info={demoProv} align="right" />
      </div>

      <section className="card" style={{ gap: 28 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "24px 40px", alignItems: "center" }}>
          <div style={{ flex: "999 1 520px", minWidth: 0, display: "flex", gap: 20, alignItems: "flex-start" }}>
            <div aria-hidden="true" style={{ flex: "none", width: 72, height: 72, borderRadius: "50%", background: "var(--blue-tint)", color: "var(--blue-deep)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 26 }}>
              {p.initials}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
              <h1 style={{ fontSize: "clamp(30px, 7cqi, 40px)", lineHeight: 1.05, fontWeight: 800 }}>{p.name}</h1>
              <span style={{ color: "var(--ink-2)" }}>{p.role}</span>
              <p style={{ marginTop: 10, fontFamily: "var(--font-display)", fontSize: "clamp(20px, 4.6cqi, 26px)", lineHeight: 1.25, fontWeight: 500, maxWidth: "28ch" }}>
                Votó como prometió en <strong style={{ fontWeight: 800 }}>{p.consistency.aligned} de {p.consistency.total}</strong> votaciones sobre temas de su programa.
              </p>
            </div>
          </div>
          <div style={{ flex: "1 1 260px", display: "flex", gap: 18, alignItems: "center" }}>
            <svg width="112" height="112" viewBox="0 0 112 112" role="img" aria-label={`${pct} por ciento de consistencia`}>
              <circle cx="56" cy="56" r="46" fill="none" stroke="#F1F2F5" strokeWidth="14" />
              <circle cx="56" cy="56" r="46" fill="none" stroke="#3B3486" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${(circ * pct) / 100} ${circ}`} transform="rotate(-90 56 56)" />
              <text x="56" y="63" textAnchor="middle" fontFamily="Playfair Display, serif" fontSize="26" fontWeight="800" fill="#16161D">{pct}%</text>
            </svg>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <strong>Consistencia</strong>
              <span style={{ color: "var(--ink-2)" }}>Promedio de la Cámara: {p.consistency.chamberAverage}%</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="small muted" style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <span>Su mandato, de {fmtDate(p.termStart)} a {fmtDate(p.termEnd)}</span>
            <span>Lleva {monthsDone} de {monthsTotal} meses</span>
          </div>
          <div className="term">
            <div className="rail" />
            <div className="rail" style={{ width: `${elapsed}%`, right: "auto", background: "var(--grey)" }} />
            {marks.map((m, i) => (
              <span key={i} title={`${fmtDate(m.date)}: ${m.text}`} style={{ position: "absolute", top: 10, left: `calc(${m.left}% - 8px)`, width: 16, height: 16, borderRadius: "50%", border: "2px solid #fff", background: m.align === "a favor" ? "var(--blue)" : "var(--copper)" }} />
            ))}
            <div style={{ position: "absolute", left: `${elapsed}%`, top: 0, bottom: 0, width: 2, background: "var(--ink)" }} />
            <span style={{ position: "absolute", left: `calc(${elapsed}% + 8px)`, top: -2, fontSize: 13, fontWeight: 700 }}>Hoy</span>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "16px 20px", borderTop: "1px solid var(--line-soft)", paddingTop: 20 }}>
          {[
            [`${p.coverage}%`, "de sus promesas ya tiene un voto, proyecto o monto en el presupuesto asociado"],
            [`${p.absences.person}%`, `de las votaciones en Sala se ausentó, frente a ${p.absences.chamber}% del promedio`],
            [`${p.againstCaucus.total} veces`, `votó distinto a su bancada, ${p.againstCaucus.onPromises} de ellas en temas que prometió`],
          ].map(([n, t]) => (
            <div key={n} style={{ flex: "1 1 220px", display: "flex", flexDirection: "column" }}>
              <span className="bignum" style={{ fontSize: 30 }}>{n}</span>
              <span style={{ color: "var(--ink-2)" }}>{t}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card" aria-labelledby="map">
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "baseline", gap: "8px 24px" }}>
          <h2 id="map" style={{ fontSize: 28 }}>Sus {allCount} promesas, por tema</h2>
          <span className="small muted">Cada punto es una promesa. Toca un tema para verlas.</span>
        </div>
        <div className="small" style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px" }}>
          {ORDER.map((k) => (
            <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={dot(k, 14)} />{ST[k].label} ({totals[k]})</span>
          ))}
        </div>
        <div style={{ borderTop: "1px solid var(--line-soft)" }}>
          {data.topics.map((t) => {
            const arr = t.statuses.split("").sort((a, b) => ORDER.indexOf(a as StatusKey) - ORDER.indexOf(b as StatusKey)) as StatusKey[];
            const kept = arr.filter((k) => k === "c").length;
            const broken = arr.filter((k) => k === "i").length;
            const on = topic === t.id;
            return (
              <button key={t.id} type="button" className="tgrid" aria-pressed={on} onClick={() => { setTopic(on ? null : t.id); const first = data.promises.find((x) => x.topic === t.id); if (!on && first) setSel(first.id); }}>
                <span style={{ display: "flex", flexDirection: "column" }}>
                  <strong style={{ fontSize: 17 }}>{t.name}</strong>
                  <span className="tiny muted">{arr.length} promesas: {kept} cumplidas{broken ? `, ${broken} ${broken > 1 ? "incumplidas" : "incumplida"}` : ""}</span>
                </span>
                <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }} aria-hidden="true">
                  {arr.map((k, i) => <span key={i} style={dot(k, 22)} />)}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="row">
        <div style={{ flex: "1 1 420px", minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <h2 style={{ fontSize: 24 }}>{topicName ? `Promesas de ${topicName.toLowerCase()} con evidencia` : "Promesas con evidencia revisada"}</h2>
            {topic && <button type="button" className="pill" onClick={() => setTopic(null)}>Ver todos los temas</button>}
          </div>
          {visible.length === 0 && (
            <div style={{ background: "#fff", border: "1.5px dashed var(--grey)", borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", gap: 8 }}>
              <strong>Todavía no hay evidencia revisada para estas promesas.</strong>
              <span className="small" style={{ color: "var(--ink-2)" }}>Se publicarán cuando haya votos o montos en el presupuesto y un editor confirme la relación.</span>
            </div>
          )}
          {visible.map((x) => (
            <button key={x.id} type="button" className="pcard" aria-pressed={sel === x.id} onClick={() => setSel(x.id)}>
              <span style={{ flex: "none", width: 6, alignSelf: "stretch", borderRadius: 3, background: ST[x.status].ring }} />
              <span style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                <span style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <span className="small muted">{data.topics.find((t) => t.id === x.topic)?.name}</span>
                  <span style={pill(x.status)}>{ST[x.status].label}</span>
                </span>
                <strong style={{ fontSize: 17, lineHeight: 1.35 }}>«{x.quote}»</strong>
                <span className="small muted">{x.evidence.length} evidencias</span>
              </span>
            </button>
          ))}
        </div>

        <aside className="card" aria-labelledby="evq" style={{ flex: "1 1 480px", minWidth: 0, gap: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className="small muted">{data.topics.find((t) => t.id === selected.topic)?.name}, promesa de {selected.type}</span>
            <span style={pill(selected.status)}>{ST[selected.status].label}</span>
          </div>
          <blockquote style={{ margin: 0 }}>
            <p id="evq" style={{ fontFamily: "var(--font-display)", fontSize: "clamp(22px, 5cqi, 28px)", lineHeight: 1.2, fontWeight: 700, letterSpacing: "-0.02em" }}>«{selected.quote}»</p>
            <footer className="small muted" style={{ marginTop: 8 }}>Programa de campaña, página {selected.page}. Cita verificada textual en el PDF original.</footer>
          </blockquote>
          <div style={{ background: "var(--ground)", borderRadius: 14, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 4 }}>
            <strong>Por qué la marcamos así</strong>
            <span className="small" style={{ color: "var(--ink-2)" }}>{selected.why}</span>
          </div>
          <div>
            <h3 style={{ fontSize: 17, fontFamily: "var(--font-body)", letterSpacing: 0, marginBottom: 12 }}>Lo que pasó desde entonces</h3>
            {selected.evidence.length === 0 && <p className="small muted">Aún no hay votaciones ni montos relacionados con esta promesa.</p>}
            <ol className="timeline">
              {selected.evidence.map((e, i) => {
                const t = TONE[e.align] ?? TONE.contexto;
                return (
                  <li key={i}>
                    <span style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <span style={{ flex: "none", width: 16, height: 16, borderRadius: "50%", marginTop: 3, background: t[0] }} />
                      <span style={{ flex: 1, width: 2, background: i === selected.evidence.length - 1 ? "transparent" : "var(--line)" }} />
                    </span>
                    <span style={{ display: "flex", flexDirection: "column", gap: 2, paddingBottom: 18 }}>
                      <span className="tiny muted">{fmtDate(e.date)}, {e.kind}</span>
                      <span>{e.text}</span>
                      <span style={{ alignSelf: "flex-start", fontSize: 13, fontWeight: 700, padding: "2px 10px", borderRadius: 999, margin: "4px 0 2px", background: t[1], color: t[2] }}>{t[3]}</span>
                      <span className="tiny muted">{e.extra}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </aside>
      </section>

      <section className="card" aria-labelledby="caucus">
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "baseline", gap: "8px 24px" }}>
          <h2 id="caucus" style={{ fontSize: 24 }}>Consistencia promedio por bancada</h2>
          <span className="small muted">Misma regla para todos. Partidos de ejemplo.</span>
        </div>
        {data.caucuses.map(([name, v], i) => (
          <div key={name} className="reg-row">
            <span style={{ fontWeight: i === 0 ? 700 : 400 }}>{name}</span>
            <span style={{ position: "relative", display: "block", height: 14, background: "var(--ground)", borderRadius: 7 }}>
              <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 7, width: `${v}%`, background: i === 0 ? "var(--blue)" : "var(--blue-soft)" }} />
              <span style={{ position: "absolute", left: `${p.consistency.chamberAverage}%`, top: -4, bottom: -4, width: 2, background: "var(--ink)" }} />
            </span>
            <span style={{ textAlign: "right", fontWeight: 700 }}>{v}%</span>
          </div>
        ))}
        <span className="tiny muted">La línea vertical marca el promedio de la Cámara ({p.consistency.chamberAverage}%).</span>
      </section>
    </main>
  );
}
