"use client";

import { useEffect, useMemo, useState } from "react";
import type { AskResult } from "@/lib/agents/ask";
import { fmtDate, STATUS_LABEL } from "@/lib/format";

type QA = AskResult & { question: string };

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ");
}

/** Best match among the pre-answered questions, by shared words. */
function bestMatch(q: string, items: QA[]): QA | null {
  const words = norm(q).split(/\s+/).filter((w) => w.length > 3);
  if (!words.length) return null;
  let best: QA | null = null;
  let score = 0;
  for (const it of items) {
    const hay = norm(it.question + " " + it.answer);
    const s = words.filter((w) => hay.includes(w)).length;
    if (s > score) {
      score = s;
      best = it;
    }
  }
  return score > 0 ? best : null;
}

export function SnapshotQA({ items, generatedAt, model }: { items: QA[]; generatedAt?: string; model?: string }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<QA | null>(items[0] ?? null);
  const [noMatch, setNoMatch] = useState(false);
  const matches = useMemo(() => (q.trim().length > 2 ? items.filter((i) => norm(i.question + " " + i.answer).includes(norm(q).trim())) : items), [q, items]);

  // ?q= from the home page search box
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("q");
    if (initial) {
      setQ(initial);
      const m = bestMatch(initial, items);
      setSel(m);
      setNoMatch(!m);
    }
  }, [items]);

  return (
    <section className="ask rise" id="preguntas" aria-labelledby="qa-l">
      <span className="kicker on-night">Preguntas con datos verificados</span>
      <h2 id="qa-l" style={{ fontSize: "clamp(28px, 6.5cqi, 42px)", lineHeight: 1.08, maxWidth: "26ch" }}>Pregunta lo que quieras saber del presupuesto</h2>
      {items.length === 0 ? (
        <p style={{ color: "#C9CAD3" }}>Esta copia del sitio no tiene respuestas generadas por IA. Se agregan al construir el sitio con una clave de Anthropic configurada.</p>
      ) : (
        <>
          <form
            style={{ display: "flex", flexWrap: "wrap", gap: 10 }}
            onSubmit={(e) => {
              e.preventDefault();
              const m = bestMatch(q, items);
              setSel(m);
              setNoMatch(!m);
            }}
          >
            <label htmlFor="qa" className="sr-only">Buscar una pregunta</label>
            <input id="qa" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca: deuda, salud, por persona…" />
            <button type="submit" className="btn" style={{ minHeight: 56, borderRadius: 999, background: "var(--accent)", color: "#fff", border: 0, fontWeight: 700, fontSize: 17, padding: "0 26px" }}>Buscar</button>
          </form>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {matches.map((it) => (
              <button key={it.question} type="button" className="pill" aria-pressed={sel?.question === it.question} onClick={() => { setSel(it); setNoMatch(false); }}>
                {it.question}
              </button>
            ))}
          </div>
          {noMatch && <p role="status" style={{ color: "#FFB4AC" }}>No hay una respuesta preparada para esa pregunta. Prueba con una de la lista o revisa los hallazgos de abajo.</p>}
          {sel && (
            <div aria-live="polite" style={{ background: "#2A2A35", borderRadius: 24, padding: 22, display: "flex", flexWrap: "wrap", gap: 24 }}>
              <div style={{ flex: "1 1 340px", display: "flex", flexDirection: "column", gap: 12 }}>
                <span className="small" style={{ color: "#C9CAD3" }}>{sel.question}</span>
                <p style={{ fontFamily: "var(--font-display)", fontSize: 21, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{sel.answer.replace(/\s*\[[a-z0-9_.-]+\]/g, "")}</p>
                <span className="small" style={{ color: "#B9B3EE", fontWeight: 700 }}>✓ Cada cifra coincide con un dato verificado</span>
                {sel.warnings.map((w) => <p key={w} className="small" style={{ color: "#FFB4AC" }}>{w}</p>)}
              </div>
              <div style={{ flex: "1 1 300px", display: "flex", flexDirection: "column", gap: 14 }}>
                <strong className="small" style={{ color: "#C9CAD3" }}>Datos usados</strong>
                <ul className="small" style={{ margin: 0, paddingLeft: 18, color: "#C9CAD3", display: "flex", flexDirection: "column", gap: 6 }}>
                  {sel.citations.map((c) => (
                    <li key={c.id}>
                      {c.label}: <strong style={{ color: "#fff" }}>{c.value}</strong> ({STATUS_LABEL[c.status]?.toLowerCase() ?? c.status}) ·{" "}
                      {c.sources.map((s, i) => (
                        <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: "#B9B3EE", marginRight: 6 }}>{s.name}</a>
                      ))}
                    </li>
                  ))}
                </ul>
                <details className="small" style={{ color: "#C9CAD3" }}>
                  <summary style={{ cursor: "pointer", fontWeight: 700, minHeight: 32 }}>Cómo se llegó a la respuesta</summary>
                  <ol style={{ margin: "8px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
                    {sel.steps.map((s, i) => <li key={i}><strong style={{ color: "#fff" }}>{s.agent}:</strong> {s.did}</li>)}
                  </ol>
                </details>
              </div>
            </div>
          )}
          {generatedAt && (
            <p className="tiny" style={{ color: "#A9AAB6" }}>
              Respuestas generadas el {fmtDate(generatedAt)}{model ? ` con ${model}` : ""} sobre los datos de ese día. Se regeneran con cada actualización del sitio; solo se
              publican las que pasan la verificación de cifras.
            </p>
          )}
        </>
      )}
    </section>
  );
}
