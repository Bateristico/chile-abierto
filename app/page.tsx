import Link from "next/link";
import { Header, Footer } from "@/components/Header";
import { Prov } from "@/components/Prov";
import { getFact } from "@/lib/facts";
import { toProv } from "@/lib/provenance/view";
import { partidas, allFindings } from "@/lib/findings/rules";
import { fmtClp, fmtDate, fmtBillones } from "@/lib/format";
import { href } from "@/lib/base";

export default function Home() {
  const pop = getFact("poblacion.2026");
  const total = getFact("ppto2027.partidas_total");
  const gcDay = getFact("gc.por_persona_dia");
  const perDay = (miles: number) => (miles * 1000) / (pop.value as number) / 365;
  const ps = partidas().sort((a, b) => (b.amount.value as number) - (a.amount.value as number));
  const top = ps.slice(0, 8);
  const rest = ps.slice(8);
  const restMiles = rest.reduce((a, p) => a + (p.amount.value as number), 0);
  const lines = [
    ...top.map((p) => ({ key: p.slug, name: p.short, val: perDay(p.amount.value as number), href: `/presupuesto?p=${p.slug}`, prov: toProv(p.amount) })),
    { key: "otros", name: `Otras ${rest.length} partidas`, val: perDay(restMiles), href: "/presupuesto", prov: null },
  ];
  const ministriesDay = perDay(total.value as number);

  const presented = getFact("tramite.presentacion");
  const cuenta = getFact("tramite.cuenta_camara");
  const deadline = getFact("tramite.plazo_fecha");
  const today = new Date();
  const daysLeft = Math.max(0, Math.ceil((Date.parse(deadline.value as string) - today.getTime()) / 86_400_000));
  const steps = [
    { when: fmtDate(presented.value as string, { short: true }), title: "El Gobierno presenta el proyecto", text: "Comienza a correr el plazo.", state: "done", prov: toProv(presented) },
    { when: fmtDate(cuenta.value as string, { short: true }), title: "La Cámara da cuenta del ingreso", text: "El proyecto pasa a la Comisión Mixta.", state: "done", prov: toProv(cuenta) },
    { when: "Octubre", title: "Subcomisiones revisan cada partida", text: "Cinco subcomisiones mixtas, ministerio por ministerio.", state: today < new Date("2026-10-25") ? "now" : "done", prov: null },
    { when: "Fines oct a nov", title: "Comisión Mixta vota las partidas", text: "Aquí se aprueban o recortan los montos.", state: today >= new Date("2026-10-25") ? "now" : "next", prov: null },
    { when: `Hasta el ${fmtDate(deadline.value as string, { short: true })}`, title: "Votan la Cámara y el Senado", text: "Si no se despacha a tiempo, rige el proyecto del Ejecutivo.", state: "next", prov: toProv(deadline) },
  ];
  const finding = allFindings().find((f) => f.origin === "regla");
  const shares = ps.slice(0, 6).map((p) => (p.amount.value as number) / (total.value as number));

  return (
    <>
      <Header current="/" />
      <main className="wrap">
        <section className="hero">
          <div style={{ flex: "999 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: 22, paddingTop: 12 }}>
            <h1>¿A dónde se va la plata de todos?</h1>
            <p className="lede">
              Leemos el presupuesto, las votaciones del Congreso y los registros de lobby directo de las fuentes oficiales, y te los explicamos en
              simple. Cada cifra muestra de dónde viene y cómo la verificamos.
            </p>
            <form className="search" action={href("/hallazgos/")} role="search">
              <label htmlFor="q" className="sr-only">Pregunta</label>
              <input id="q" name="q" type="search" placeholder="Pregunta: ¿cuánto sube Salud en 2027?" />
              <button className="btn primary" style={{ minHeight: 56, borderRadius: 14, fontSize: 17, padding: "0 24px" }}>Preguntar</button>
            </form>
          </div>

          <figure aria-labelledby="bol-title" style={{ flex: "1 1 300px", maxWidth: 410, margin: "0 auto" }}>
            <div className="boleta">
              <div style={{ textAlign: "center", paddingBottom: 14, borderBottom: "1.5px dashed var(--grey)", display: "flex", flexDirection: "column", gap: 2 }}>
                <span id="bol-title" style={{ fontWeight: 500, fontSize: 16 }}>Boleta diaria del Estado</span>
                <span className="muted tiny">Gasto de los ministerios por persona, cada día</span>
                <span className="muted tiny">Proyecto de Presupuestos 2027</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", padding: "10px 0" }}>
                {lines.map((l) => (
                  <Link key={l.key} href={l.href} className="bline">
                    <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "62%" }}>{l.name}</span>
                    <span className="leader" aria-hidden="true" />
                    <span style={{ whiteSpace: "nowrap", fontWeight: 500 }}>{fmtClp(l.val)}</span>
                  </Link>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: "1.5px dashed var(--grey)", paddingTop: 12 }}>
                <span style={{ fontSize: 16, fontWeight: 500 }}>Total ministerios</span>
                <span className="bignum" style={{ fontSize: 34 }}>{fmtClp(ministriesDay)}</span>
              </div>
              <p className="tiny muted" style={{ margin: "10px 0 6px", lineHeight: 1.5 }}>
                {fmtBillones(total.value as number)} de 32 partidas ÷ {(pop.value as number).toLocaleString("es-CL")} personas ÷ 365 días. Con deuda y subsidios del
                Tesoro Público, el Gobierno Central gasta {fmtClp(gcDay.value as number)} por persona al día.
              </p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontFamily: "var(--font-body)" }}>
                <Prov info={toProv(total)} />
                <Prov info={toProv(gcDay)} />
              </div>
            </div>
            <svg className="zigzag" viewBox="0 0 400 12" preserveAspectRatio="none" aria-hidden="true">
              <path d={`M0 0 ${Array.from({ length: 40 }, (_, i) => `L${i * 10 + 5} 12 L${i * 10 + 10} 0`).join(" ")} Z`} fill="#fff" />
            </svg>
            <figcaption className="tiny muted" style={{ marginTop: 10 }}>Toca una línea para ver ese ministerio en detalle.</figcaption>
          </figure>
        </section>

        <section className="card" aria-labelledby="tram">
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "baseline", gap: "8px 24px" }}>
            <h2 id="tram" style={{ fontSize: "clamp(24px, 5cqi, 30px)", lineHeight: 1.15 }}>El Presupuesto 2027 se está discutiendo ahora</h2>
            <span className="muted">El Congreso tiene 60 días: {daysLeft > 0 ? `quedan ${daysLeft}` : "el plazo terminó"}</span>
          </div>
          <ol className="steps">
            {steps.map((s, i) => {
              const c = s.state === "done" ? "var(--blue)" : s.state === "now" ? "var(--copper)" : "var(--grey)";
              const size = s.state === "now" ? 18 : 12;
              return (
                <li key={i}>
                  <span className="step-track">
                    <span style={{ flex: "none", width: size, height: size, borderRadius: "50%", background: s.state === "next" ? "#fff" : c, border: `2px solid ${c}`, boxShadow: s.state === "now" ? "0 0 0 5px var(--copper-tint)" : undefined }} />
                    {i < steps.length - 1 && <span className="step-line" style={{ background: s.state === "done" ? "var(--blue)" : undefined }} />}
                  </span>
                  <span className="tiny muted">{s.when}</span>
                  <strong style={{ lineHeight: 1.3, color: s.state === "now" ? "var(--copper-deep)" : undefined }}>{s.title}</strong>
                  <span className="small" style={{ color: "var(--ink-2)" }}>{s.text}</span>
                  {s.prov && <span><Prov info={s.prov} /></span>}
                </li>
              );
            })}
          </ol>
        </section>

        <section aria-label="Explorar" className="card" style={{ padding: 0, gap: 0, overflow: "hidden" }}>
          <Link href="/presupuesto" className="rowlink">
            <span style={{ flex: "1 1 360px", display: "flex", flexDirection: "column", gap: 4 }}>
              <h2>Presupuesto</h2>
              <span style={{ color: "var(--ink-2)" }}>Recorre las 32 partidas del Proyecto 2027 y cuánto suben o bajan en términos reales.</span>
            </span>
            <span aria-hidden="true" style={{ flex: "1 1 320px", display: "flex", height: 22, gap: 2, borderRadius: 6, overflow: "hidden" }}>
              {shares.map((s, i) => (
                <span key={i} style={{ flex: s, background: ["#1F2FA8", "#3046D9", "#5C6FE3", "#8795EC", "#A9B4F1", "#C2CAF5"][i] }} />
              ))}
              <span style={{ flex: 1 - shares.reduce((a, b) => a + b, 0), background: "#DCE3FB" }} />
            </span>
          </Link>
          <Link href="/promesas" className="rowlink">
            <span style={{ flex: "1 1 360px", display: "flex", flexDirection: "column", gap: 4 }}>
              <h2>Promesas vs votos</h2>
              <span style={{ color: "var(--ink-2)" }}>Lo que cada parlamentario prometió en campaña, al lado de cómo ha votado desde marzo.</span>
            </span>
            <span className="small muted" style={{ flex: "1 1 320px" }}>Votaciones desde los datos abiertos de la Cámara; cada promesa con su cita textual verificada en el programa original.</span>
          </Link>
          {finding && (
            <Link href={`/hallazgos?f=${finding.id}`} className="rowlink">
              <span style={{ flex: "1 1 360px", display: "flex", flexDirection: "column", gap: 4 }}>
                <h2>Hallazgos</h2>
                <span style={{ color: "var(--ink-2)" }}>Conexiones entre presupuesto, votos, lobby y aportes de campaña, calculadas con reglas que puedes revisar.</span>
              </span>
              <span style={{ flex: "1 1 320px", borderLeft: "3px solid var(--blue)", padding: "4px 0 4px 14px", display: "flex", flexDirection: "column", gap: 2 }}>
                <span className="tiny muted">Último hallazgo</span>
                <strong>{finding.title}</strong>
              </span>
            </Link>
          )}
        </section>
        <Footer />
      </main>
    </>
  );
}
