import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header, Footer } from "@/components/Header";
import { DepthChip, ImpactDial, StatusChip } from "@/components/leyes/LawBits";
import { billByBoletin, pageBoletines, velocidad } from "@/lib/leyes/load";
import { clasificacionDe, dial, PROFUNDIDAD } from "@/lib/leyes/clasificacion";
import { gobiernoOn } from "@/lib/leyes/gobiernos";
import { CAMARA_BILL_URL, SENADO_BILL_URL, daysBetween, daysToLaw, type Bill } from "@/lib/leyes/types";
import { congresoData } from "@/lib/congreso/load";
import { partyOn, voteTitle } from "@/lib/congreso/types";
import { fmtNumber } from "@/lib/format";

export const dynamicParams = false;

export function generateStaticParams() {
  const all = [...pageBoletines()];
  return all.length ? all.map((b) => ({ b })) : [{ b: "sin-datos" }];
}

export async function generateMetadata({ params }: { params: Promise<{ b: string }> }): Promise<Metadata> {
  const bill = billByBoletin((await params).b);
  return { title: bill ? (bill.ley ? `Ley ${bill.ley}` : `Boletín ${bill.b}`) : "Ley" };
}

const fmtDay = (iso?: string) => (iso ? new Date(iso + "T12:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" }) : "—");
const dur = (d: number) => (d < 60 ? `${d} días` : d < 730 ? `${Math.round(d / 30.4)} meses` : `${(d / 365).toFixed(1).replace(".", ",")} años`);

const PARTE: Record<string, Record<string, string>> = {
  alcance: { amplio: "Casi toda la población o un grupo masivo", grande: "Un grupo numeroso", acotado: "Una profesión o un sector pequeño", local: "Un lugar o pocas personas", desconocido: "No se puede leer del registro" },
  permanencia: { permanente: "Permanente", temporal: "Temporal, con plazo", puntual: "Un acto único", desconocido: "No se puede leer del registro" },
  derechos: { crea: "Crea derechos, beneficios, deberes o sanciones", ajusta: "Ajusta derechos o deberes existentes", ninguno: "No cambia derechos ni deberes", desconocido: "No se puede leer del registro" },
  instituciones: { crea: "Crea organismos o facultades nuevas", ajusta: "Ajusta organismos existentes", ninguna: "No toca instituciones", desconocido: "No se puede leer del registro" },
};

/** Stages grouped into the phases a citizen recognises, each with its share of the bill's time. */
function phases(b: Bill) {
  const end = b.publicada ?? b.ultimo?.fecha ?? b.ingreso;
  const total = Math.max(1, daysBetween(b.ingreso, end));
  return b.etapas.map((e) => ({
    ...e,
    dias: Math.max(0, daysBetween(e.desde, e.hasta)),
    x0: (daysBetween(b.ingreso, e.desde) / total) * 100,
    w: Math.max(0.8, (daysBetween(e.desde, e.hasta) / total) * 100),
    kind: /mixta/i.test(e.etapa) ? "mixta" : /tribunal/i.test(e.etapa) ? "tc" : "",
  }));
}

export default async function LeyPage({ params }: { params: Promise<{ b: string }> }) {
  const { b: boletin } = await params;
  const bill = billByBoletin(boletin);
  if (!bill) {
    if (boletin === "sin-datos")
      return (
        <>
          <Header current="/leyes" />
          <main className="wrap"><div className="card"><h1 className="sec-title">Las leyes se publican con la próxima captura</h1><Link href="/leyes/">Volver a Leyes</Link></div><Footer /></main>
        </>
      );
    notFound();
  }
  const c = clasificacionDe(bill);
  const di = c ? dial(c) : null;
  const days = daysToLaw(bill);
  const speed = velocidad().leer(bill);
  const gov = bill.iniciativa === "Mensaje" ? gobiernoOn(bill.ingreso) : undefined;

  const cong = congresoData();
  const votes = (cong?.periodos ?? []).flatMap((p) => p.votaciones.filter((v) => v.b === bill.b).map((v) => ({ v, p })));
  votes.sort((a, z) => z.v.f.localeCompare(a.v.f));
  const deputies = new Map((cong?.periodos ?? []).flatMap((p) => p.diputados.map((d) => [d.id, { d, p }] as const)));
  const authors = bill.autores.map((id) => deputies.get(id)).filter((x) => !!x);
  const urgTypes: Record<string, number> = {};
  for (const u of bill.urgencias) urgTypes[u.tipo] = (urgTypes[u.tipo] ?? 0) + 1;
  const ph = phases(bill);

  return (
    <>
      <Header current="/leyes" />
      <main className="wrap">
        <nav className="small" aria-label="Ruta"><Link href="/leyes/">Leyes</Link> › {bill.ley ? `Ley ${bill.ley}` : `Boletín ${bill.b}`}</nav>
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <span className="kicker">{bill.ley ? `Ley ${bill.ley} · boletín ${bill.b}` : `Proyecto de ley · boletín ${bill.b}`}</span>
          <h1 className="display" style={{ fontSize: "clamp(28px, 5.5cqi, 44px)", maxWidth: "30ch" }}>{bill.titulo}</h1>
          <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <StatusChip st={bill.st} />
            <span className="chip">{bill.iniciativa === "Mensaje" ? "Proyecto del Gobierno (Mensaje)" : "Moción parlamentaria"}</span>
            {c && <DepthChip p={c.profundidad} por={c.por} />}
            {bill.st === "tramite" && bill.urgenciaActual && !/sin urgencia/i.test(bill.urgenciaActual) && <span className="chip warn">Urgencia {bill.urgenciaActual.toLowerCase()}</span>}
          </span>
        </section>

        <section className="kpis" aria-label="Datos clave">
          <div className="kpi"><span className="lbl">Ingresó</span><span className="bignum" style={{ fontSize: 26 }}>{fmtDay(bill.ingreso)}</span><span className="tiny muted">por {bill.origen === "C" ? "la Cámara" : "el Senado"}</span></div>
          {bill.st === "ley" ? (
            <div className="kpi"><span className="lbl">Publicada en el Diario Oficial</span><span className="bignum" style={{ fontSize: 26 }}>{fmtDay(bill.publicada)}</span></div>
          ) : (
            <div className="kpi"><span className="lbl">Dónde está</span><span style={{ fontWeight: 700, fontSize: 18 }}>{bill.etapa || bill.estado}</span><span className="tiny muted">Último movimiento: {fmtDay(bill.ultimo?.fecha)}</span></div>
          )}
          <div className="kpi">
            <span className="lbl">{days !== null ? "Tardó en ser ley" : "Lleva en el Congreso"}</span>
            <span className="bignum" style={{ fontSize: 30 }}>{dur(days ?? daysBetween(bill.ingreso, new Date().toISOString().slice(0, 10)))}</span>
            {speed && <span className="tiny muted">{speed} frente a leyes de su misma profundidad</span>}
          </div>
          <div className="kpi">
            <span className="lbl">Urgencias puestas por el Gobierno</span>
            <span className="bignum" style={{ fontSize: 30 }}>{fmtNumber(bill.urgencias.length)}</span>
            <span className="tiny muted">{Object.entries(urgTypes).map(([k, n]) => `${n} ${k.toLowerCase()}`).join(" · ") || "Ninguna"}</span>
          </div>
        </section>

        <section className="card" style={{ gap: 14 }} aria-labelledby="imp-t">
          <div>
            <span className="kicker">Profundidad e impacto</span>
            <h2 id="imp-t" className="sec-title">{c ? `${PROFUNDIDAD[c.profundidad].label}: ${PROFUNDIDAD[c.profundidad].que.toLowerCase()}` : "Aún sin clasificar"}</h2>
          </div>
          {c ? (
            <>
              <p style={{ color: "var(--ink-2)" }}>{c.razon}</p>
              <p className="tiny muted">
                {c.por === "regla" ? `Clasificada por la regla publicada «${c.regla}».` : c.por === "ia" ? "Borrador de IA, pendiente de revisión: se hizo solo con el registro oficial del proyecto (título, materias y tramitación)." : "Revisada por un editor."}{" "}
                <Link href="/metodos/#profundidad">Cómo se clasifica</Link>
              </p>
              <ImpactDial nivel={di?.nivel ?? null} size={64} />
              <div className="parts">
                {(["alcance", "permanencia", "derechos", "instituciones"] as const).map((k) => (
                  <div key={k}>
                    <span className="k">{k === "derechos" ? "Derechos y deberes" : k.charAt(0).toUpperCase() + k.slice(1)}</span>
                    <span>{c.partes ? PARTE[k][c.partes[k]] : "No se puede leer del registro"}</span>
                  </div>
                ))}
                <div>
                  <span className="k">Dinero</span>
                  <span className="muted">Pendiente: se leerá del informe financiero</span>
                </div>
              </div>
            </>
          ) : (
            <p style={{ color: "var(--ink-2)" }}>Este proyecto todavía no tiene borrador ni regla que lo clasifique.</p>
          )}
        </section>

        {ph.length > 0 && (
          <section className="card" style={{ gap: 14 }} aria-labelledby="cam-t">
            <div>
              <span className="kicker">El camino</span>
              <h2 id="cam-t" className="sec-title">Cada etapa y lo que duró</h2>
            </div>
            <div className="ltl">
              {ph.map((e, i) => (
                <div key={i} className={`ltl-row ${e.kind}`}>
                  <span>{e.etapa}<span className="tiny muted" style={{ display: "block" }}>{e.camara || " "}</span></span>
                  <span className="ltl-bar" aria-hidden="true"><span style={{ left: `${e.x0}%`, width: `${e.w}%` }} /></span>
                  <span className="tiny" style={{ whiteSpace: "nowrap" }}>{e.dias ? dur(e.dias) : "mismo día"}</span>
                </div>
              ))}
            </div>
            {bill.señales.length > 0 && <p className="small" style={{ color: "var(--ink-2)" }}>Pasó por: {bill.señales.join(" · ")}.</p>}
          </section>
        )}

        <section className="card" style={{ gap: 12 }} aria-labelledby="quien-t">
          <div>
            <span className="kicker">Quién lo propuso</span>
            <h2 id="quien-t" className="sec-title">{bill.iniciativa === "Mensaje" ? (gov ? `${gov.nombre} (${gov.presidente})` : "El Gobierno en ejercicio en esa fecha") : (() => { const n = Math.max(bill.autores.length, bill.autoresNombres.length); return n === 1 ? "1 parlamentario" : n ? `${fmtNumber(n)} parlamentarios` : "Parlamentarios"; })()}</h2>
          </div>
          {authors.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18, columns: "2 240px", color: "var(--ink-2)" }}>
              {authors.map(({ d, p }) => (
                <li key={d.id}><Link href={`/diputados/?p=${p.id}&id=${d.id}`}>{d.nombre}</Link> <span className="tiny muted">{partyOn(d, bill.ingreso)}</span></li>
              ))}
            </ul>
          )}
          {!authors.length && bill.autoresNombres.length > 0 && <p className="small" style={{ color: "var(--ink-2)" }}>{bill.autoresNombres.join(" · ")}</p>}
        </section>

        <section className="card" style={{ gap: 12 }} aria-labelledby="vot-t">
          <div>
            <span className="kicker">Votaciones en la Cámara</span>
            <h2 id="vot-t" className="sec-title">{votes.length ? `${fmtNumber(votes.length)} votaciones en Sala` : "Sin votaciones en Sala en la serie"}</h2>
          </div>
          {votes.length > 0 && (
            <>
              <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6, color: "var(--ink-2)" }}>
                {votes.slice(0, 6).map(({ v, p }) => (
                  <li key={v.id}>
                    <Link href={`/votaciones/?p=${p.id}&b=${bill.b}&v=${v.id}`}>{fmtDay(v.f.slice(0, 10))}</Link> · {v.tipo ?? voteTitle(v)} · {v.r} ({v.si}–{v.no}
                    {v.ab ? `, ${v.ab} abst.` : ""})
                  </li>
                ))}
              </ul>
              <Link className="btn" style={{ alignSelf: "flex-start" }} href={`/votaciones/?p=${votes[0].p.id}&b=${bill.b}`}>Ver cómo votó cada diputado</Link>
            </>
          )}
        </section>

        <section className="small" style={{ color: "var(--ink-2)" }}>
          Fuentes: <a href={SENADO_BILL_URL(bill.b)} target="_blank" rel="noopener noreferrer">tramitación en el Senado</a> · <a href={CAMARA_BILL_URL(bill.b, bill.camaraId)} target="_blank" rel="noopener noreferrer">ficha en la Cámara</a>
          {bill.ley && (
            <>
              {" "}· <a href={`https://www.bcn.cl/leychile/navegar?idLey=${bill.ley.replace(/\./g, "")}`} target="_blank" rel="noopener noreferrer">texto en LeyChile</a>
            </>
          )}
        </section>
        <Footer />
      </main>
    </>
  );
}
