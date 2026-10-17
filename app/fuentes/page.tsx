import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { Header, Footer } from "@/components/Header";
import { Prov } from "@/components/Prov";
import { loadFacts, snapshotInfo } from "@/lib/facts";
import { aiSnapshot } from "@/lib/findings/rules";
import { STATUS_ORDER } from "@/lib/provenance/types";
import { toProv } from "@/lib/provenance/view";
import { fmtFact, STATUS_HELP, STATUS_LABEL } from "@/lib/format";
import { CONNECTORS } from "@/lib/connectors";
import { PUBLISHERS } from "@/lib/provenance/sources";

export const metadata: Metadata = { title: "Cómo verificamos" };

const DOMAIN_LABEL: Record<string, string> = { presupuesto: "Presupuesto", congreso: "Congreso", electoral: "Electoral", integridad: "Integridad", contexto: "Contexto" };

export default function Fuentes() {
  const facts = loadFacts().filter((f) => f.status !== "pendiente");
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, facts.filter((f) => f.status === s).length]));
  const totalChecks = facts.reduce((a, f) => a + f.checks.length, 0);
  const store = path.join(process.cwd(), "data", "store");
  const connectorState = CONNECTORS.map((c) => {
    const factsFile = path.join(store, `${c.id}.facts.json`);
    const recordsFile = path.join(store, `${c.id}.records.json`);
    const issuesFile = path.join(store, `${c.id}.issues.json`);
    const last = [factsFile, recordsFile].filter((p) => fs.existsSync(/*turbopackIgnore: true*/ p)).map((p) => fs.statSync(/*turbopackIgnore: true*/ p).mtime)[0];
    const issues = fs.existsSync(/*turbopackIgnore: true*/ issuesFile) ? (JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ issuesFile, "utf8")).issues as string[]) : [];
    return { ...c, last, issues };
  });
  const groups = [...new Set(facts.map((f) => f.domain))];
  const snap = snapshotInfo();
  const ai = aiSnapshot() as (ReturnType<typeof aiSnapshot> & { rejectedInsights?: { title: string; reason: string }[]; droppedQuestions?: { question: string; reason: string }[] }) | null;

  return (
    <>
      <Header current="/fuentes" />
      <main className="wrap">
        <section className="card" style={{ gap: 20 }}>
          <span className="kicker">Fuentes y método</span>
          <h1 style={{ fontSize: "clamp(30px, 7cqi, 44px)", lineHeight: 1.08, fontWeight: 800, maxWidth: "20ch" }}>Cómo verificamos cada cifra</h1>
          <p style={{ fontSize: 18, color: "var(--ink-2)", maxWidth: "46em" }}>
            Cada número de Chile Abierto viene con su fuente, la fecha en que lo consultamos y las comprobaciones que pasó. Si una comprobación falla, el número no se
            publica: la página no se construye hasta que se corrige.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px 32px" }}>
            {STATUS_ORDER.filter((s) => s !== "pendiente").map((s) => (
              <div key={s} style={{ flex: "1 1 200px", display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="bignum" style={{ fontSize: 34 }}>{counts[s]}</span>
                <strong>{STATUS_LABEL[s]}</strong>
                <span className="small" style={{ color: "var(--ink-2)" }}>{STATUS_HELP[s]}</span>
              </div>
            ))}
          </div>
          <p className="small muted">{facts.length} datos publicados, {totalChecks} comprobaciones automáticas, todas aprobadas.</p>
        </section>

        <section className="card">
          <h2 style={{ fontSize: 24 }}>Las reglas</h2>
          <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8, color: "var(--ink-2)" }}>
            <li><strong style={{ color: "var(--ink)" }}>Solo publicadores registrados.</strong> Cada fuente debe venir del dominio del organismo o medio que dice ser. La ingesta automática solo descarga de organismos públicos.</li>
            <li><strong style={{ color: "var(--ink)" }}>Copia inmutable.</strong> Lo que descarga la ingesta se guarda con su huella sha256, para poder rehacer cualquier cifra.</li>
            <li><strong style={{ color: "var(--ink)" }}>Las fuentes deben coincidir.</strong> Leemos el número tal como lo imprime cada fuente y comprobamos que todas digan lo mismo.</li>
            <li><strong style={{ color: "var(--ink)" }}>Cuadraturas.</strong> Los totales se rehacen desde sus partes; los votos individuales deben sumar los totales oficiales de cada votación; los cálculos se recalculan en cada construcción.</li>
            <li><strong style={{ color: "var(--ink)" }}>Una cifra calculada no es más fuerte que su dato más débil.</strong></li>
            <li><strong style={{ color: "var(--ink)" }}>La IA no inventa cifras.</strong> Cada número de una respuesta del asistente debe coincidir con un dato verificado que consultó; si no, se le pide corregir y, si persiste, se advierte. Las promesas solo se aceptan si su cita aparece textual en el programa original.</li>
          </ol>
        </section>

        <section className="card">
          <h2 style={{ fontSize: 24 }}>Conectores a fuentes oficiales</h2>
          <p className="small" style={{ color: "var(--ink-2)" }}>
            {snap ? `Última captura: ${new Date(snap.takenAt).toLocaleString("es-CL", { timeZone: "America/Santiago" })} (hora de Chile).` : "Aún no hay captura automática: el sitio usa los datos semilla verificados a mano."}
          </p>
          <div className="scroll-x">
            <table className="ledger">
              <thead>
                <tr><th>Conector</th><th>Qué trae</th><th>Última ingesta</th><th>Estado</th></tr>
              </thead>
              <tbody>
                {connectorState.map((c) => (
                  <tr key={c.id}>
                    <td><code>{c.id}</code></td>
                    <td>{c.description}{c.requires?.length ? <div className="tiny muted">Requiere {c.requires.join(", ")}</div> : null}
                      {c.requiresAnyOf?.length ? <div className="tiny muted">Requiere {c.requiresAnyOf.map((s) => s.join(" + ")).join(" o ")}</div> : null}</td>
                    <td>{c.last ? c.last.toISOString().slice(0, 10) : "Aún no ejecutado"}</td>
                    <td>
                      {(() => {
                        const st = snap?.connectors.find((x) => x.id === c.id);
                        if (c.issues.length) return <span className="check-bad">{c.issues.length} problemas en revisión<div className="tiny">{c.issues.slice(0, 2).join(" · ")}</div></span>;
                        if (st?.status === "issues") return <span className="check-bad">{st.detail}</span>;
                        if (st?.status === "error") return <span className="check-bad">No respondió en la última captura</span>;
                        if (st?.status === "skipped") return <span className="muted">Sin credenciales</span>;
                        if (st?.status === "ok") return <span className="check-ok">Al día<div className="tiny muted">{st.detail.length > 160 ? st.detail.slice(0, 160) + "…" : st.detail}</div></span>;
                        return c.last ? <span className="check-ok">Al día</span> : <span className="muted">Pendiente</span>;
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <h2 style={{ fontSize: 24 }}>Capa de inteligencia artificial</h2>
          {ai ? (
            <>
              <p className="small" style={{ color: "var(--ink-2)" }}>
                Generada el {new Date(ai.generatedAt).toLocaleString("es-CL", { timeZone: "America/Santiago" })} con {ai.model}. Publicados: {ai.insights.length} hallazgos y {ai.qa.length} respuestas.
                Descartados por no pasar la verificación: {ai.rejectedInsights?.length ?? 0} hallazgos y {ai.droppedQuestions?.length ?? 0} respuestas.
              </p>
              {!!ai.errors?.length && (
                <div className="small" role="status" style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 10, margin: "8px 0", color: "var(--ink-2)" }}>
                  <strong>La llamada a la API falló en esta captura:</strong>
                  <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{ai.errors.map((e, i) => <li key={i}><code>{e}</code></li>)}</ul>
                </div>
              )}
              {!!ai.rejectedInsights?.length && (
                <details className="small">
                  <summary style={{ cursor: "pointer", fontWeight: 700, minHeight: 32 }}>Ver lo descartado y por qué</summary>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6, color: "var(--ink-2)" }}>
                    {ai.rejectedInsights.map((r, i) => <li key={i}>«{r.title}»: {r.reason}</li>)}
                    {ai.droppedQuestions?.map((r, i) => <li key={`q${i}`}>Pregunta «{r.question}»: {r.reason}</li>)}
                  </ul>
                </details>
              )}
            </>
          ) : (
            <p className="small" style={{ color: "var(--ink-2)" }}>Esta copia no tiene capa de IA: se genera al construir el sitio con una clave de Anthropic.</p>
          )}
        </section>

        {groups.map((g) => (
          <section key={g} className="card">
            <h2 style={{ fontSize: 24 }}>{DOMAIN_LABEL[g] ?? g}</h2>
            <div className="scroll-x">
              <table className="ledger">
                <thead>
                  <tr><th>Dato</th><th>Valor</th><th>Nivel</th></tr>
                </thead>
                <tbody>
                  {facts.filter((f) => f.domain === g).map((f) => (
                    <tr key={f.id} id={f.id}>
                      <td>{f.label}<div className="tiny muted"><code>{f.id}</code></div></td>
                      <td style={{ whiteSpace: "nowrap", fontWeight: 700 }}>{fmtFact(f)}</td>
                      <td><Prov info={toProv(f)} align="right" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}

        <section className="card">
          <h2 style={{ fontSize: 24 }}>Publicadores registrados</h2>
          <ul className="small" style={{ margin: 0, paddingLeft: 18, columns: "2 280px", color: "var(--ink-2)" }}>
            {PUBLISHERS.map((p) => (
              <li key={p.id}><a href={p.homepage} target="_blank" rel="noopener noreferrer">{p.name}</a> ({p.kind})</li>
            ))}
          </ul>
        </section>
        <Footer />
      </main>
    </>
  );
}
