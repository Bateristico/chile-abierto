import type { Metadata } from "next";
import Link from "next/link";
import { Header, Footer } from "@/components/Header";
import { Prov } from "@/components/Prov";
import { DepthChip, ImpactDial, StatusChip } from "@/components/leyes/LawBits";
import { agendaGobierno, leyesData } from "@/lib/leyes/load";
import { clasificacionDe, dial } from "@/lib/leyes/clasificacion";
import { GOBIERNO_ACTUAL } from "@/lib/leyes/gobiernos";
import { daysBetween, daysToLaw } from "@/lib/leyes/types";
import { maybeFact } from "@/lib/facts";
import { toProv } from "@/lib/provenance/view";
import { fmtNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Gobierno" };

const fmtDay = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
/** Legal deadline each urgency sets for the chamber (Ley 18.918, art. 27). */
const PLAZO: Record<string, string> = { Simple: "30 días", Suma: "15 días", "Discusión inmediata": "6 días" };

export default function Gobierno() {
  const g = GOBIERNO_ACTUAL;
  const data = leyesData();
  const a = data ? agendaGobierno(g) : null;
  const today = new Date().toISOString().slice(0, 10);
  const dias = daysBetween(g.desde, today);
  const fM = maybeFact(`leyes.${g.id}.mensajes`);
  const fL = maybeFact(`leyes.${g.id}.publicadas`);
  const statuses = a
    ? ([
        ["ley", "Ya son ley", a.ley, "var(--teal)"],
        ["tramite", "En el Congreso", a.tramite, "var(--blue-soft)"],
        ["retirado", "Retirados", a.retirado, "var(--grey)"],
        ["rechazado", "Rechazados", a.rechazado, "var(--copper-fill)"],
        ["archivado", "Archivados", a.archivado, "var(--line)"],
      ] as const)
    : [];

  return (
    <>
      <Header current="/gobierno" />
      <main className="wrap">
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span className="kicker">Gobierno</span>
          <h1 className="display" style={{ fontSize: "clamp(34px, 7cqi, 56px)", maxWidth: "22ch" }}>
            {g.nombre}: <em>su agenda en el Congreso</em>
          </h1>
          <p style={{ fontSize: 18, color: "var(--ink-2)", maxWidth: "46em" }}>
            El Presidente {g.presidente} asumió el {fmtDay(g.desde)} (<a href={g.fuente.url} target="_blank" rel="noopener noreferrer">fuente</a>). Lleva {fmtNumber(dias)} días de gobierno. Aquí está
            cada proyecto que ha enviado, cuántos ya son ley y a cuáles les ha puesto urgencia.
          </p>
        </section>

        {a ? (
          <>
            <section className="kpis" aria-label="Resumen">
              <div className="kpi rise d1"><span className="lbl">Proyectos enviados al Congreso</span><span className="bignum">{fmtNumber(a.total)}</span>{fM && <span><Prov info={toProv(fM)} /></span>}</div>
              <div className="kpi rise d2"><span className="lbl">Ya publicados como ley</span><span className="bignum">{fmtNumber(a.ley)}</span><span className="tiny muted">{pct(a.ley, a.total)}% de lo enviado</span>{fL && <span><Prov info={toProv(fL)} /></span>}</div>
              <div className="kpi rise d3"><span className="lbl">Urgencias puestas</span><span className="bignum">{fmtNumber(a.urgencias)}</span><span className="tiny muted">en {fmtNumber(a.conUrgencia)} proyectos</span></div>
              <div className="kpi rise d4"><span className="lbl">Lo que tardan sus leyes (mediana)</span><span className="bignum">{a.medianaDias !== null ? `${fmtNumber(Math.round(a.medianaDias))} días` : "—"}</span><span className="tiny muted">del envío a la publicación</span></div>
            </section>

            <section className="card" style={{ gap: 14 }} aria-labelledby="estado-t">
              <div>
                <span className="kicker">Estado de lo enviado</span>
                <h2 id="estado-t" className="sec-title">{a.total ? `${pct(a.ley, a.total)}% ya es ley; ${pct(a.tramite, a.total)}% sigue en el Congreso` : "Aún no hay proyectos enviados"}</h2>
              </div>
              {a.total > 0 && (
                <>
                  <div className="stack" role="img" aria-label={statuses.map(([, l, n]) => `${l}: ${n}`).join(", ")}>
                    {statuses.filter(([, , n]) => n).map(([k, , n, col]) => <span key={k} className="growY" style={{ flex: n, background: col }} />)}
                  </div>
                  <div className="legend">
                    {statuses.filter(([, , n]) => n).map(([k, l, n, col]) => (
                      <Link key={k} href={`/leyes/?ini=M&st=${k}&desde=${g.desde}`}>
                        <span className="sw" style={{ background: col }} />
                        <span><strong>{l}</strong> · {fmtNumber(n)}</span>
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </section>

            <section className="card" style={{ gap: 14 }} aria-labelledby="urg-t">
              <div>
                <span className="kicker">Urgencias</span>
                <h2 id="urg-t" className="sec-title">Qué apura el Gobierno</h2>
              </div>
              <p style={{ color: "var(--ink-2)", maxWidth: "46em" }}>
                Una urgencia obliga a la cámara a despachar el proyecto en un plazo: 30 días la simple, 15 la suma y 6 la discusión inmediata. Cuando el plazo vence sin votación, el Gobierno
                suele renovarla.{" "}
                {a.conUrgencia > 0 && (
                  <>
                    En promedio, cada proyecto con urgencia la ha recibido <strong>{a.renovacionesPromedio.toFixed(1).replace(".", ",")} veces</strong>
                    {a.renovacionesPromedio >= 3 ? ". Renovar tanto suele indicar proyectos que el Gobierno quiere apurar y que el Congreso no ha votado dentro del plazo." : "."}
                  </>
                )}
              </p>
              <div className="kpis">
                {Object.entries(a.urgenciasPorTipo).sort((x, y) => y[1] - x[1]).map(([k, n]) => (
                  <div key={k} className="kpi" style={{ background: "var(--ground)" }}>
                    <span className="lbl">{k}{PLAZO[k] ? ` · plazo ${PLAZO[k]}` : ""}</span>
                    <span className="bignum" style={{ fontSize: 30 }}>{fmtNumber(n)}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="card" style={{ gap: 12 }} aria-labelledby="lista-t">
              <div>
                <span className="kicker">Cada proyecto</span>
                <h2 id="lista-t" className="sec-title">Lo que ha enviado, del más reciente al más antiguo</h2>
              </div>
              <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                {[...a.bills].sort((x, y) => y.ingreso.localeCompare(x.ingreso)).map((b) => {
                  const c = clasificacionDe(b);
                  const d = daysToLaw(b);
                  return (
                    <li key={b.b}>
                      <Link className="vrow" href={`/leyes/${b.b}/`} style={{ textDecoration: "none", background: "var(--ground)" }}>
                        <span className="vtitle vart">{b.titulo}</span>
                        <span style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                          <StatusChip st={b.st} />
                          {c && <DepthChip p={c.profundidad} por={c.por} />}
                          {b.urgencias.length > 0 && <span className="chip warn">{b.urgencias.length === 1 ? "1 urgencia" : `${b.urgencias.length} urgencias`}</span>}
                          {c && dial(c) && <ImpactDial nivel={dial(c)!.nivel} size={34} />}
                        </span>
                        <span className="tiny muted">Boletín {b.b} · enviado el {fmtDay(b.ingreso)}{b.ley ? ` · Ley ${b.ley}${d !== null ? `, en ${d} días` : ""}` : ` · ${b.etapa}`}</span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </section>
          </>
        ) : (
          <div className="card">
            <h2 className="sec-title">La agenda del Gobierno se publica con la próxima captura</h2>
          </div>
        )}

        <section className="card lilac small" style={{ gap: 8 }}>
          <strong>Próximamente en esta página</strong>
          <p style={{ color: "var(--ink-2)" }}>
            El programa de gobierno y los anuncios de la Cuenta Pública, cada uno con su estado (sin iniciar, proyecto enviado, ley, ley rebajada, rechazado), y los resultados en
            gasto y en indicadores.
          </p>
        </section>
        <Footer />
      </main>
    </>
  );
}
