"use client";

import { useState } from "react";
import type { AskResult } from "@/lib/agents/ask";

const EXAMPLES = ["¿Cuánto sube Salud en 2027?", "¿Qué partidas tienen las mayores bajas?", "¿Cuánta deuda pide autorizar el Gobierno?"];

export function AskPanel({ enabled, initial }: { enabled: boolean; initial?: string }) {
  const [q, setQ] = useState(initial ?? "");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<AskResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask(question: string) {
    if (!question.trim()) return;
    setQ(question);
    setLoading(true);
    setError(null);
    setRes(null);
    try {
      const r = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "No se pudo responder.");
      setRes(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="ask" aria-labelledby="ask-l">
      <label id="ask-l" htmlFor="ask" style={{ fontFamily: "var(--font-display)", fontSize: "clamp(26px, 6.5cqi, 36px)", lineHeight: 1.1, fontWeight: 800, letterSpacing: "-0.03em", maxWidth: "22ch" }}>
        Haz una pregunta y cruzamos los datos verificados por ti
      </label>
      <form
        style={{ display: "flex", flexWrap: "wrap", gap: 10 }}
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <input id="ask" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Por ejemplo: ¿qué ministerios bajan en 2027?" disabled={!enabled} />
        <button type="submit" className="btn" disabled={!enabled || loading} style={{ minHeight: 58, borderRadius: 14, background: "var(--blue-soft)", border: 0, fontWeight: 700, fontSize: 17, padding: "0 26px" }}>
          {loading ? "Analizando…" : "Preguntar"}
        </button>
      </form>
      {!enabled && <p className="small" style={{ color: "#C9D0DA" }}>El asistente no está configurado en este servidor (falta ANTHROPIC_API_KEY). Los hallazgos de abajo se calculan sin IA.</p>}
      {enabled && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <span className="small" style={{ color: "#C9D0DA" }}>O prueba con:</span>
          {EXAMPLES.map((x) => (
            <button key={x} type="button" className="pill" onClick={() => ask(x)}>{x}</button>
          ))}
        </div>
      )}
      {error && <p role="alert" style={{ color: "#F6C9B3" }}>{error}</p>}
      {res && (
        <div aria-live="polite" style={{ background: "#263040", borderRadius: 16, padding: 22, display: "flex", flexWrap: "wrap", gap: 24 }}>
          <ol aria-label="Cómo lo resolvieron los agentes" style={{ flex: "1 1 300px", listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            {res.steps.map((s, i) => (
              <li key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={{ flex: "none", width: 28, height: 28, borderRadius: "50%", background: "var(--blue-soft)", color: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14 }}>{i + 1}</span>
                <span style={{ display: "flex", flexDirection: "column" }}>
                  <strong>{s.agent}</strong>
                  <span className="small" style={{ color: "#C9D0DA" }}>{s.did}</span>
                </span>
              </li>
            ))}
          </ol>
          <div style={{ flex: "1 1 340px", display: "flex", flexDirection: "column", gap: 12 }}>
            <span className="small" style={{ color: res.grounded ? "#A9B4F1" : "#F6C9B3", fontWeight: 700 }}>
              {res.grounded ? "✓ Cada cifra viene de un dato verificado" : "Atención: hay cifras sin respaldo verificado"}
            </span>
            <p style={{ fontSize: 18, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{res.answer.replace(/\s*\[[a-z0-9_.-]+\]/g, "")}</p>
            {res.warnings.map((w) => <p key={w} className="small" style={{ color: "#F6C9B3" }}>{w}</p>)}
            {res.citations.length > 0 && (
              <ul className="small" style={{ margin: 0, paddingLeft: 18, color: "#C9D0DA", display: "flex", flexDirection: "column", gap: 4 }}>
                {res.citations.map((c) => (
                  <li key={c.id}>
                    {c.label}: <strong style={{ color: "#fff" }}>{c.value}</strong> ({c.status}) ·{" "}
                    {c.sources.map((s, i) => (
                      <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: "#A9B4F1", marginRight: 6 }}>{s.name}</a>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
