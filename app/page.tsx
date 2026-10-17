import Link from "next/link";
import { Header, Footer } from "@/components/Header";
import { Prov } from "@/components/Prov";
import { ShareBar, type ShareItem } from "@/components/ShareBar";
import { Hemicycle } from "@/components/Hemicycle";
import { BarsArt, HeroArt, PALETTE, PALETTE_INK, TopicIcon, topicOf } from "@/components/Art";
import { getFact } from "@/lib/facts";
import { toProv } from "@/lib/provenance/view";
import { partidas, allFindings } from "@/lib/findings/rules";
import { camaraComposition, programas } from "@/lib/camara-view";
import { fmtClp, fmtDate, fmtPct, fmtNumber } from "@/lib/format";
import { href } from "@/lib/base";

const ORIGIN = { regla: "Calculado con reglas", ia: "Propuesto por IA y verificado", ejemplo: "Ejemplo" } as const;

export default function Home() {
  const pop = getFact("poblacion.2026");
  const total = getFact("ppto2027.partidas_total");
  const gcTotal = getFact("gc.gasto_total_2027");
  const gcDay = getFact("gc.por_persona_dia");
  const growth = getFact("gc.crecimiento_real_2027");
  const def27 = getFact("gc.meta_deficit_estructural_2027");
  const def26 = getFact("gc.deficit_estructural_2026");
  const debt = getFact("deuda.autorizacion_2027");
  const debtIni = getFact("deuda.limite_inicial_2026");
  const debtAmp = getFact("deuda.ampliacion_2026");
  const n = (f: { value: unknown }) => f.value as number;
  const perDay = (miles: number) => (miles * 1000) / n(pop) / 365;

  // Receipt and share bar: the six largest partidas plus the rest.
  const ps = partidas().sort((a, b) => n(b.amount) - n(a.amount));
  const top = ps.slice(0, 6);
  const rest = ps.slice(6);
  const restMiles = rest.reduce((a, p) => a + n(p.amount), 0);
  const items: ShareItem[] = [
    ...top.map((p, i) => ({ key: p.slug, name: p.short, miles: n(p.amount), varPct: n(p.variation), color: PALETTE[i], ink: PALETTE_INK[i], href: `/presupuesto?p=${p.slug}` })),
    { key: "otras", name: `Otras ${rest.length} partidas`, miles: restMiles, varPct: null, color: PALETTE[6], ink: PALETTE_INK[6], href: "/presupuesto" },
  ];
  const ministriesDay = perDay(n(total));

  // Biggest real increases and cuts.
  const byVar = [...ps].sort((a, b) => n(b.variation) - n(a.variation));
  const movers = [...byVar.slice(0, 5), ...byVar.slice(-5)];
  const maxAbs = Math.max(...movers.map((p) => Math.abs(n(p.variation))));
  const largeCuts = ps.filter((p) => n(p.amount) >= 1e9 && n(p.variation) < 0);

  // Congress calendar.
  const presented = getFact("tramite.presentacion");
  const cuenta = getFact("tramite.cuenta_camara");
  const deadline = getFact("tramite.plazo_fecha");
  const now = Date.now();
  const start = Date.parse(presented.value as string);
  const end = Date.parse(deadline.value as string);
  const daysLeft = Math.max(0, Math.ceil((end - now) / 86_400_000));
  const progress = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));

  const findings = allFindings();
  const lead = findings.find((f) => f.id === "alzas-y-bajas") ?? findings[0];
  const others = findings.filter((f) => f !== lead).slice(0, 4);
  const camara = camaraComposition();
  const progs = programas();

  const debtLimit = n(debtIni) + n(debtAmp);
  const debtMax = Math.max(debtLimit, n(debt));

  return (
    <>
      <Header current="/" />
      <main className="wrap">
        <section className="hero">
          <article className="hero-card rise">
            <div style={{ flex: "999 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
              <span className="kicker on-night">Proyecto de Presupuesto 2027</span>
              <h1>
                El Estado gastará <em>{fmtClp(n(gcDay))}</em> al día por cada habitante
              </h1>
              <p className="lede">
                El Gobierno Central propone gastar {fmtPct(n(growth), true).replace("+", "")} más en términos reales en 2027. Así se reparte, con la fuente de cada cifra a un toque.
              </p>
              <div className="night" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <Link href="/presupuesto" className="btn primary">
                  Recorrer las 32 partidas
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </Link>
                <Prov info={toProv(gcDay)} />
              </div>
            </div>
            <HeroArt />
          </article>

          <aside className="receipt rise d2" aria-labelledby="bol">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <h2 id="bol" style={{ fontSize: 26 }}>Tu boleta del día</h2>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)" }}>Proyecto 2027</span>
            </div>
            <p className="small muted">Gasto diario de los ministerios por habitante. Toca una línea para ver la partida.</p>
            <div className="dash" />
            <div style={{ display: "flex", flexDirection: "column" }}>
              {items.map((it, i) => (
                <Link key={it.key} href={it.href} className={`rline rise d${i + 2}`}>
                  <span className="sw" style={{ background: it.color }} />
                  <span className="nm">{it.name}</span>
                  <span className="am">{fmtClp(perDay(it.miles))}</span>
                </Link>
              ))}
            </div>
            <div className="dash" />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: "0.08em", textTransform: "uppercase" }}>Ministerios</span>
              <span className="bignum" style={{ fontSize: 34 }}>{fmtClp(ministriesDay)}</span>
            </div>
            <div className="stack grow d5" aria-hidden="true">
              {items.map((it) => <span key={it.key} style={{ flex: it.miles, background: it.color }} />)}
            </div>
            <p className="tiny muted">
              Con deuda, subsidios y otros gastos del Tesoro Público, el Gobierno Central llega a {fmtClp(n(gcDay))} por persona al día.
            </p>
            <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Prov info={toProv(total)} />
              <Prov info={toProv(pop)} />
            </span>
          </aside>
        </section>

        <section className="kpis" aria-label="Cifras clave">
          <div className="kpi rise d1">
            <span className="lbl">Gasto total del Gobierno Central</span>
            <span className="bignum">${fmtNumber(n(gcTotal) / 1e6, 1)} <small>billones</small></span>
            <svg viewBox="0 0 200 40" width="100%" height="40" aria-hidden="true">
              <path className="draw" style={{ ["--len" as string]: 220 }} d="M0 34 L40 30 L80 31 L120 24 L160 19 L200 10" fill="none" stroke="#3B3486" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <span><Prov info={toProv(gcTotal)} /></span>
          </div>
          <div className="kpi rise d2">
            <span className="lbl">Crecimiento real del gasto</span>
            <span className="bignum" style={{ color: "var(--blue)" }}>{fmtPct(n(growth), true)}</span>
            <div style={{ height: 40, display: "flex", alignItems: "flex-end", gap: 6 }} aria-hidden="true">
              {[55, 70, 62, 100].map((h, i) => (
                <span key={i} className={`growY d${i + 3}`} style={{ flex: 1, height: `${h}%`, background: i === 3 ? "var(--blue)" : "var(--blue-tint)", borderRadius: 4 }} />
              ))}
            </div>
            <span><Prov info={toProv(growth)} /></span>
          </div>
          <div className="kpi rise d3">
            <span className="lbl">Meta de déficit estructural</span>
            <span className="bignum">{fmtPct(n(def27))} <small>del PIB</small></span>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="minirow"><span>2026</span><span className="b grow d4" style={{ width: "100%", background: "#F6C1BC" }} /><span style={{ textAlign: "right" }}>{fmtPct(n(def26))}</span></div>
              <div className="minirow"><span>2027</span><span className="b grow d5" style={{ width: `${(Math.abs(n(def27)) / Math.abs(n(def26))) * 100}%`, background: "var(--copper-fill)" }} /><span style={{ textAlign: "right" }}>{fmtPct(n(def27))}</span></div>
            </div>
            <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><Prov info={toProv(def27)} /><Prov info={toProv(def26)} align="right" /></span>
          </div>
          <div className="kpi rise d4">
            <span className="lbl">Deuda que pide autorizar</span>
            <span className="bignum">US${fmtNumber(n(debt))} <small>mill.</small></span>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="minirow"><span>2026</span><span style={{ display: "flex", height: 10, borderRadius: 4, overflow: "hidden", width: `${(debtLimit / debtMax) * 100}%` }}><span className="grow d5" style={{ flex: n(debtIni), background: "#8C83D9" }} /><span className="grow d6" style={{ flex: n(debtAmp), background: "#C9C4F0" }} /></span><span style={{ textAlign: "right" }}>{fmtNumber(debtLimit / 1000, 1)}k</span></div>
              <div className="minirow"><span>2027</span><span className="b grow d7" style={{ width: `${(n(debt) / debtMax) * 100}%`, background: "var(--blue)" }} /><span style={{ textAlign: "right" }}>{fmtNumber(n(debt) / 1000, 1)}k</span></div>
            </div>
            <span className="tiny muted">Límite 2026 inicial + ampliación, frente a lo pedido para 2027</span>
            <span><Prov info={toProv(debt)} /></span>
          </div>
        </section>

        <section className="card rise d3" style={{ gap: 22 }}>
          <ShareBar items={items} totalMiles={n(total)} population={n(pop)} />
        </section>

        <section className="row" style={{ alignItems: "stretch" }}>
          <div className="card rise d2" style={{ flex: "999 1 560px", minWidth: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="kicker">Variación real 2027 frente a 2026</span>
              <h2 className="sec-title">Quién sube y quién baja</h2>
            </div>
            <div className="div-head"><span style={{ color: "var(--copper)" }}>◀ Recortes</span><span style={{ color: "var(--blue)" }}>Alzas ▶</span></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {movers.map((p, i) => {
                const v = n(p.variation);
                const w = `${Math.max(4, (Math.abs(v) / maxAbs) * 100)}%`;
                return (
                  <Link key={p.slug} href={`/presupuesto?p=${p.slug}`} className="div-row" aria-label={`${p.name}: ${fmtPct(v, true)} real`}>
                    <span className="side l">
                      {v < 0 && (<><span className="v" style={{ color: "var(--copper)" }}>{fmtPct(v, true)}</span><span className={`bar-down growR d${(i % 8) + 1}`} style={{ width: w }} /></>)}
                    </span>
                    <span className="nm">{p.short}</span>
                    <span className="side r">
                      {v >= 0 && (<><span className={`bar-up grow d${(i % 8) + 1}`} style={{ width: w }} /><span className="v" style={{ color: "var(--blue)" }}>{fmtPct(v, true)}</span></>)}
                    </span>
                  </Link>
                );
              })}
            </div>
            <p className="small muted">
              Las cinco mayores alzas y bajas de las 32 partidas.
              {largeCuts.length === 1 ? ` ${largeCuts[0].short} (${fmtPct(n(largeCuts[0].variation), true)}) es la única partida de más de $1 billón que baja.` : ""}
            </p>
            <span><Prov info={toProv(movers[0].variation)} /></span>
          </div>

          <div className="card lilac rise d3" style={{ flex: "1 1 340px", minWidth: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="kicker" style={{ color: "var(--blue)" }}>En el Congreso</span>
              <h2 className="sec-title">
                {daysLeft > 0 ? (<>Quedan <em>{daysLeft} días</em> para despacharlo</>) : "Terminó el plazo legal"}
              </h2>
            </div>
            <div className="progress" role="img" aria-label={`${Math.round(progress)}% del plazo transcurrido`}>
              <span className="grow d4" style={{ width: `${progress}%` }} />
            </div>
            <ol className="tl">
              <li><span className="pt" style={{ background: "var(--blue)" }} /><div><strong style={{ display: "block" }}>{fmtDate(presented.value as string, { short: true })} · Presentación</strong><span className="small" style={{ color: "var(--ink-2)" }}>El Ejecutivo ingresa el proyecto y empieza el plazo de 60 días.</span><div><Prov info={toProv(presented)} /></div></div></li>
              <li><span className="pt" style={{ background: "var(--blue)" }} /><div><strong style={{ display: "block" }}>{fmtDate(cuenta.value as string, { short: true })} · Cuenta en la Cámara</strong><span className="small" style={{ color: "var(--ink-2)" }}>Pasa a la Comisión Especial Mixta de Presupuestos.</span><div><Prov info={toProv(cuenta)} /></div></div></li>
              {daysLeft > 0 && (
                <li><span className="pt pulse" style={{ background: "var(--copper-fill)" }} /><div><strong style={{ display: "block" }}>Hoy · tramitación en curso</strong><span className="small" style={{ color: "var(--ink-2)" }}>Subcomisiones y Comisión Mixta revisan las partidas.</span></div></li>
              )}
              <li><span className="pt" style={{ background: "#fff", boxShadow: "inset 0 0 0 2px var(--blue)" }} /><div><strong style={{ display: "block" }}>{fmtDate(deadline.value as string, { short: true })} · Plazo legal</strong><span className="small" style={{ color: "var(--ink-2)" }}>Si no se despacha, rige el proyecto del Ejecutivo.</span><div><Prov info={toProv(deadline)} /></div></div></li>
            </ol>
          </div>
        </section>

        {lead && (
          <section style={{ display: "flex", flexDirection: "column", gap: 18 }} aria-labelledby="hall">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
              <h2 id="hall" className="sec-title">Hallazgos de hoy</h2>
              <Link href="/hallazgos" className="btn">Ver todos los hallazgos</Link>
            </div>
            <div className="row" style={{ alignItems: "stretch" }}>
              <Link href={`/hallazgos?f=${lead.id}`} className="story-lead rise d2">
                <span className="art" style={{ background: "var(--copper-tint)" }}><BarsArt /></span>
                <span className="body">
                  <span className="tag" style={{ color: "var(--accent)" }}>{lead.cross}</span>
                  <h3>{lead.title}</h3>
                  <span style={{ color: "var(--ink-2)" }}>{lead.summary}</span>
                  <span className="tiny muted">{ORIGIN[lead.origin]}</span>
                </span>
              </Link>
              <div style={{ flex: "1 1 360px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
                {others.map((f, i) => {
                  const t = topicOf(f.cross, f.origin);
                  return (
                    <Link key={f.id} href={`/hallazgos?f=${f.id}`} className={`story rise d${i + 3}`}>
                      <span className="thumb" style={{ background: t.tint }}><TopicIcon topic={t} /></span>
                      <span style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                        <span className="tag" style={{ color: t.ink }}>{f.cross}{f.origin === "ejemplo" ? " · Ejemplo" : ""}</span>
                        <h3>{f.title}</h3>
                        <span className="tiny muted">{ORIGIN[f.origin]}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        <section className="band rise d3" aria-labelledby="pv">
          <div style={{ flex: "999 1 420px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            <span className="kicker on-night">Promesas y votos</span>
            {camara ? (
              <>
                <h2 id="pv" className="sec-title">
                  {fmtNumber(n(camara.total))} diputados{camara.votaciones ? `, ${fmtNumber(n(camara.votaciones))} votaciones en ${camara.votaciones.id.slice(-4)}` : ""}
                  {camara.cuadradas ? `, ${fmtNumber(n(camara.cuadradas))} cuadradas voto a voto.` : "."}
                </h2>
                <p>
                  Cada voto individual se suma y se compara con los totales oficiales de la Cámara antes de mostrarse. Las promesas se toman textuales de los{" "}
                  {progs.items.length} programas presidenciales inscritos en el Servel.
                </p>
                <div className="parties">
                  {camara.parties.map((p) => (
                    <span key={p.key}><i style={{ background: p.color }} />{p.alias} {p.n}</span>
                  ))}
                </div>
                <span className="night" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Prov info={toProv(camara.total)} />
                  {camara.cuadradas && <Prov info={toProv(camara.cuadradas)} />}
                </span>
              </>
            ) : (
              <>
                <h2 id="pv" className="sec-title">Lo que prometieron, al lado de cómo votan.</h2>
                <p>
                  Votaciones desde los datos abiertos de la Cámara, cada una cuadrada con sus totales oficiales, y promesas citadas textual desde los {progs.items.length} programas
                  presidenciales inscritos en el Servel.
                </p>
              </>
            )}
            <span>
              <Link href="/promesas" className="btn primary">Ver promesas y votos</Link>
            </span>
          </div>
          {camara && (
            <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", justifyContent: "center" }}>
              <Hemicycle dark groups={camara.parties.map((p) => ({ key: p.key, label: p.label, n: p.n, color: p.color }))} label={`Cámara de Diputadas y Diputados: ${camara.parties.map((p) => `${p.alias} ${p.n}`).join(", ")}`} />
            </div>
          )}
        </section>

        <form className="search" action={href("/hallazgos/")} role="search" style={{ maxWidth: "none" }}>
          <label htmlFor="q" className="sr-only">Pregunta</label>
          <input id="q" name="q" type="search" placeholder="Pregunta: ¿cuánto sube Salud en 2027?" />
          <button className="btn primary" style={{ minHeight: 52 }}>Preguntar</button>
        </form>
        <Footer />
      </main>
    </>
  );
}
