import { Prov } from "./Prov";
import { maybeFact } from "@/lib/facts";
import { toProv } from "@/lib/provenance/view";
import type { FichaRecord } from "@/lib/camara-view";
import { fmtDate, fmtNumber } from "@/lib/format";

type Verdict = { label: string; bg: string; fg: string; tone: "ok" | "partial" | "bad" | "none" };

const V: Record<string, Verdict> = {
  ok: { label: "En línea con el programa", bg: "var(--blue)", fg: "#fff", tone: "ok" },
  partial: { label: "En línea, en parte", bg: "var(--blue-soft)", fg: "var(--ink)", tone: "partial" },
  tension: { label: "En tensión con la promesa", bg: "var(--copper)", fg: "#fff", tone: "bad" },
  against: { label: "Votó en contra", bg: "var(--copper)", fg: "#fff", tone: "bad" },
  abst: { label: "Se abstuvo", bg: "var(--butter)", fg: "var(--butter-ink)", tone: "none" },
  absent: { label: "No votó", bg: "var(--line-soft)", fg: "var(--ink-2)", tone: "none" },
  novote: { label: "Sin votación en su periodo", bg: "var(--surface)", fg: "var(--ink-2)", tone: "none" },
};

/** Reading of a vote against a promise, by the relation the editors assigned between promise and bill. */
export function verdictOf(relacion: "implementa" | "parcial" | "tension", dominante: string | null): Verdict {
  if (!dominante) return V.novote;
  if (dominante === "Abstención") return V.abst;
  if (dominante === "No vota") return V.absent;
  const favor = dominante === "A favor";
  if (relacion === "tension") return favor ? V.tension : V.ok;
  if (!favor) return V.against;
  return relacion === "parcial" ? V.partial : V.ok;
}

const OPT_COLOR: Record<string, string> = { "A favor": "var(--blue)", "En contra": "var(--copper-fill)", Abstención: "var(--amber)", "No vota": "var(--grey)" };

export function FichaReal({ f }: { f: FichaRecord }) {
  const fact = (k: string) => maybeFact(`ficha.${f.slug}.${k}`);
  const n = (k: string) => (fact(k)?.value as number | undefined) ?? 0;
  const total = n("votaciones");
  const voted = n("a_favor") + n("en_contra") + n("abstencion");
  const participation = total ? Math.round((voted / total) * 100) : 0;
  const comparables = n("comparables_partido");
  const distinto = n("distinto_partido");
  const verdicts = f.promesas.map((p) => verdictOf(p.relacion, p.dominante));
  const aligned = verdicts.filter((v) => v.tone === "ok" || v.tone === "partial").length;
  const evaluable = verdicts.filter((v) => v !== V.novote).length;
  const circ = 2 * Math.PI * 46;
  const initials = f.perfil.nombre.split(" ").slice(0, 2).map((w) => w[0]).join("");
  const maxYear = Math.max(...f.porAnno.map((y) => y.total), 1);
  const opts: [string, number][] = [["A favor", n("a_favor")], ["En contra", n("en_contra")], ["Abstención", n("abstencion")], ["No vota", n("no_vota")]];

  return (
    <main className="wrap" style={{ paddingTop: 8 }}>
      <section className="card night rise" style={{ gap: 24 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "24px 40px", alignItems: "center" }}>
          <div style={{ flex: "999 1 520px", minWidth: 0, display: "flex", gap: 20, alignItems: "flex-start" }}>
            <span aria-hidden="true" style={{ flex: "none", width: 76, height: 76, borderRadius: "50%", background: "var(--blue-tint)", color: "var(--blue)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 28 }}>
              {initials}
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
              <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span className="kicker on-night">Ficha con datos reales</span>
                <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 10px", borderRadius: 999, background: "rgba(255,255,255,.1)", color: "var(--night-ink)" }}>Periodo terminado</span>
              </span>
              <h2 className="display" style={{ fontSize: "clamp(30px, 6cqi, 44px)" }}>{f.perfil.nombre}</h2>
              <span style={{ color: "var(--night-ink)" }}>{f.perfil.cargo}</span>
              <span className="small" style={{ color: "#A9AAB6" }}>{f.perfil.distrito}</span>
            </div>
          </div>
          <div style={{ flex: "1 1 260px", display: "flex", gap: 18, alignItems: "center" }}>
            <svg width="112" height="112" viewBox="0 0 112 112" role="img" aria-label={`${aligned} de ${evaluable} promesas con votos en línea con el programa`}>
              <circle cx="56" cy="56" r="46" fill="none" stroke="#2A2A35" strokeWidth="13" />
              <circle className="ring" cx="56" cy="56" r="46" fill="none" stroke="#FF8A80" strokeWidth="13" strokeLinecap="round" strokeDasharray={`${evaluable ? (circ * aligned) / evaluable : 0} ${circ}`} transform="rotate(-90 56 56)" />
              <text x="56" y="58" textAnchor="middle" fontFamily="Playfair Display, serif" fontSize="26" fontWeight="800" fill="#fff">{aligned}/{evaluable}</text>
              <text x="56" y="76" textAnchor="middle" fontFamily="Public Sans, sans-serif" fontSize="10" fill="#C9CAD3">en línea</text>
            </svg>
            <p style={{ color: "var(--night-ink)", fontSize: 15 }}>
              De {f.promesas.length} compromisos del programa con proyecto asociado, {evaluable} tuvieron votación en su periodo. En {aligned} votó en línea con lo prometido.
            </p>
          </div>
        </div>
        <p style={{ color: "var(--night-ink)", maxWidth: "60em" }}>{f.perfil.trayectoria} {f.perfil.reeleccion}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="tiny" style={{ color: "#A9AAB6" }}>Militancia según la Cámara</span>
          <div style={{ display: "flex", height: 30, borderRadius: 10, overflow: "hidden", gap: 2 }}>
            {f.militancias.map((m) => {
              const s = Date.parse(f.periodo.inicio);
              const e = Date.parse(f.periodo.fin);
              const w = ((Math.min(Date.parse(m.hasta), e) - Math.max(Date.parse(m.desde), s)) / (e - s)) * 100;
              return (
                <span key={m.desde} className="grow" style={{ flex: Math.max(w, 1), background: m.alias === "IND" ? "#4A4A57" : "var(--accent-soft)", color: m.alias === "IND" ? "#fff" : "var(--ink)", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", padding: "0 10px", whiteSpace: "nowrap", overflow: "hidden" }}>
                  {m.alias === "IND" ? "Independiente" : m.alias} · desde {fmtDate(m.desde, { short: true })} {m.desde.slice(0, 4)}
                </span>
              );
            })}
          </div>
        </div>
        <span style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 13 }}>
          <a href={f.perfil.fuente.url} target="_blank" rel="noopener noreferrer" style={{ color: "#B9B3EE" }}>Reseña BCN</a>
          <a href={f.perfil.camara} target="_blank" rel="noopener noreferrer" style={{ color: "#B9B3EE" }}>Ficha en camara.cl</a>
        </span>
      </section>

      <section className="row" style={{ alignItems: "stretch" }}>
        <div className="card rise d1" style={{ flex: "1 1 360px", minWidth: 0 }}>
          <span className="kicker">Su voto, {f.periodo.inicio.slice(0, 4)}–{f.periodo.fin.slice(0, 4)}</span>
          <span className="bignum" style={{ fontSize: 48 }}>{participation}%</span>
          <span style={{ color: "var(--ink-2)" }}>de las {fmtNumber(total)} votaciones en Sala con su registro, votó a favor, en contra o se abstuvo.</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {opts.map(([k, v], i) => (
              <div key={k} className="minirow" style={{ gridTemplateColumns: "90px minmax(0, 1fr) 56px", fontSize: 13 }}>
                <span>{k}</span>
                <span className={`b grow d${i + 2}`} style={{ width: `${total ? (v / total) * 100 : 0}%`, background: OPT_COLOR[k], minWidth: 3 }} />
                <span style={{ textAlign: "right", fontWeight: 700, color: "var(--ink)" }}>{fmtNumber(v)}</span>
              </div>
            ))}
          </div>
          <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{fact("votaciones") && <Prov info={toProv(fact("votaciones")!)} />}</span>
        </div>

        <div className="card rise d2" style={{ flex: "1 1 360px", minWidth: 0 }}>
          <span className="kicker">Frente a su partido</span>
          <span className="bignum" style={{ fontSize: 48 }}>{fmtNumber(distinto)}</span>
          <span style={{ color: "var(--ink-2)" }}>
            veces votó distinto a la mayoría de su partido, de {fmtNumber(comparables)} votaciones comparables
            {comparables ? ` (${Math.round((distinto / comparables) * 100)}%)` : ""}. Solo cuenta desde que milita: antes era independiente.
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {f.porAnno.map((y) => (
              <div key={y.anno} className="minirow" style={{ gridTemplateColumns: "40px minmax(0, 1fr) 44px", fontSize: 12 }}>
                <span>{y.anno}</span>
                <span style={{ display: "flex", height: 10, borderRadius: 4, overflow: "hidden", width: `${(y.total / maxYear) * 100}%` }}>
                  <span className="grow d3" style={{ flex: y.aFavor, background: OPT_COLOR["A favor"] }} />
                  <span className="grow d4" style={{ flex: y.enContra, background: OPT_COLOR["En contra"] }} />
                  <span className="grow d5" style={{ flex: y.abstencion, background: OPT_COLOR["Abstención"] }} />
                  <span className="grow d6" style={{ flex: y.noVota, background: OPT_COLOR["No vota"] }} />
                </span>
                <span style={{ textAlign: "right" }}>{fmtNumber(y.total)}</span>
              </div>
            ))}
          </div>
          <span className="tiny muted">Votaciones por año: a favor, en contra, abstención y sin voto.</span>
          <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{fact("distinto_partido") && <Prov info={toProv(fact("distinto_partido")!)} />}</span>
        </div>
      </section>

      <section className="card rise d3" aria-labelledby="prom-real">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="kicker">Promesas y votos</span>
          <h2 id="prom-real" className="sec-title">Lo que prometía su coalición y cómo votó</h2>
          <p className="small" style={{ color: "var(--ink-2)", maxWidth: "52em" }}>
            {f.programa.nota} Cada cita está verificada textual en el{" "}
            <a href={f.programa.url} target="_blank" rel="noopener noreferrer">PDF oficial del Servel</a> ({f.programa.paginas} páginas, sha256 {f.programa.sha256.slice(0, 10)}…). La relación entre
            cada promesa y el proyecto la propone la redacción de Chile Abierto; los votos son los registrados por la Cámara.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
          {f.promesas.map((p, i) => {
            const v = verdicts[i];
            const counted = Object.entries(p.tally).filter(([, c]) => c > 0);
            return (
              <article key={p.id} className={`rise d${(i % 6) + 2}`} style={{ background: "var(--ground)", borderRadius: 20, padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
                <span style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span className="tag" style={{ color: "var(--accent)" }}>{p.tema}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: v.bg, color: v.fg, boxShadow: v === V.novote ? "inset 0 0 0 1px var(--line)" : undefined }}>{v.label}</span>
                </span>
                <blockquote style={{ margin: 0 }}>
                  <p style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 19, lineHeight: 1.35 }}>«{p.cita}»</p>
                  <footer className="tiny muted" style={{ marginTop: 6 }}>
                    <a href={`${f.programa.url}#page=${p.pagina}`} target="_blank" rel="noopener noreferrer">Programa, página {p.pagina}</a> · cita verificada textual
                  </footer>
                </blockquote>
                <div style={{ background: "var(--surface)", borderRadius: 14, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                  <span className="small" style={{ fontWeight: 600 }}>
                    <a href={`https://www.camara.cl/legislacion/ProyectosDeLey/tramitacion.aspx?prmBOLETIN=${p.proyecto.boletin}`} target="_blank" rel="noopener noreferrer">Boletín {p.proyecto.boletin}</a>: {p.proyecto.nombre}
                  </span>
                  {p.votos.length ? (
                    <>
                      <span style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", gap: 1 }} aria-hidden="true">
                        {counted.map(([k, c]) => <span key={k} className="grow" style={{ flex: c, background: OPT_COLOR[k] }} />)}
                      </span>
                      <span className="tiny" style={{ color: "var(--ink-2)" }}>{counted.map(([k, c]) => `${k} ${c}`).join(" · ")} — en {p.votos.length} votaciones de este proyecto durante su periodo</span>
                    </>
                  ) : (
                    <span className="tiny muted">La Cámara no votó este proyecto en Sala durante su periodo.</span>
                  )}
                  <span className="tiny muted">{p.nota}</span>
                </div>
                {p.votos.length > 0 && (
                  <details className="tiny">
                    <summary style={{ cursor: "pointer", fontWeight: 700, minHeight: 28 }}>Ver sus {p.votos.length} votos</summary>
                    <ul style={{ margin: "6px 0 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
                      {p.votos.slice(0, 30).map((x) => (
                        <li key={x.id} style={{ display: "grid", gridTemplateColumns: "80px minmax(0, 1fr) auto", gap: 8 }}>
                          <span className="muted">{fmtDate(x.fecha, { short: true })} {x.fecha.slice(0, 4)}</span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={x.articulo}>{x.tipo}{x.articulo ? ` · ${x.articulo}` : ""}</span>
                          <strong style={{ color: OPT_COLOR[x.opcion] === "var(--grey)" ? "var(--muted)" : undefined }}>{x.opcion}</strong>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </article>
            );
          })}
        </div>
        {f.rechazadas.length > 0 && <p className="tiny muted">{f.rechazadas.length} citas no se publicaron porque no aparecen textual en el PDF.</p>}
      </section>

      {f.disidencias.length > 0 && (
        <section className="card rise d4" aria-labelledby="dis">
          <span className="kicker">Cuando se apartó de su partido</span>
          <h2 id="dis" className="sec-title">Votaciones en que votó distinto a la mayoría de su partido</h2>
          <div className="scroll-x">
            <table className="ledger">
              <thead>
                <tr><th>Fecha</th><th>Votación</th><th>Su voto</th><th>Mayoría de su partido</th></tr>
              </thead>
              <tbody>
                {f.disidencias.slice(0, 12).map((d) => (
                  <tr key={d.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{fmtDate(d.fecha)}</td>
                    <td>{d.descripcion || `Votación ${d.id}`}</td>
                    <td style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{d.opcion}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{d.mayoriaPartido} ({d.partido})</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
