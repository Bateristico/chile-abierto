import type { Metadata } from "next";
import Link from "next/link";
import { Header, Footer } from "@/components/Header";
import { Prov } from "@/components/Prov";
import { LeyesExplorer } from "@/components/leyes/LeyesExplorer";
import { maybeFact } from "@/lib/facts";
import { toProv } from "@/lib/provenance/view";
import { fmtNumber } from "@/lib/format";
import { leyesData } from "@/lib/leyes/load";
import { clasificacionDe } from "@/lib/leyes/clasificacion";
import { PROFUNDIDAD, type Profundidad } from "@/lib/leyes/labels";
import { daysToLaw, median } from "@/lib/leyes/types";

export const metadata: Metadata = { title: "Leyes" };

const COLORS: Record<Profundidad | "sin", string> = { simbolica: "var(--line)", ajuste: "var(--blue-soft)", sectorial: "var(--blue-mid)", estructural: "var(--blue-deep)", sin: "var(--line-soft)" };
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const months = (d: number) => `${Math.round(d / 30.4)} meses`;

export default function Leyes() {
  const data = leyesData();
  const bills = data?.bills ?? [];
  const laws = bills.filter((b) => b.st === "ley" && (b.publicada ?? "") >= (data?.desde ?? ""));
  const depth: Record<Profundidad | "sin", number> = { simbolica: 0, ajuste: 0, sectorial: 0, estructural: 0, sin: 0 };
  let ia = 0;
  for (const b of laws) {
    const c = clasificacionDe(b);
    depth[c?.profundidad ?? "sin"]++;
    if (c?.por === "ia") ia++;
  }
  const filed = bills.filter((b) => b.ingreso >= (data?.desde ?? ""));
  const origin = (ini: "Mensaje" | "Moción") => {
    const f = filed.filter((b) => b.iniciativa === ini);
    const l = f.filter((b) => b.st === "ley");
    return { presentados: f.length, leyes: l.length, mediana: median(l.map(daysToLaw).filter((x): x is number => x !== null)) };
  };
  const mens = origin("Mensaje");
  const moc = origin("Moción");
  const fLeyes = maybeFact("leyes.publicadas_desde_2022");
  const fDias = maybeFact("leyes.mediana_dias_a_ley");
  const medianAll = median(laws.map(daysToLaw).filter((x): x is number => x !== null));

  return (
    <>
      <Header current="/leyes" />
      <main className="wrap">
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span className="kicker">Leyes</span>
          <h1 className="display" style={{ fontSize: "clamp(34px, 7cqi, 56px)", maxWidth: "22ch" }}>
            Qué llega a ser ley, <em>cuánto tarda y cuánto cambia</em>
          </h1>
          <p style={{ fontSize: 18, color: "var(--ink-2)", maxWidth: "46em" }}>
            Cada proyecto presentado desde marzo de 2022, del Gobierno o de parlamentarios, con su camino completo: etapas, urgencias y fecha de publicación. Cada ley
            publicada lleva su profundidad y un indicador de impacto, con las razones a la vista.
          </p>
        </section>

        {data ? (
          <>
            {!!data.sinLeer && (
              <p className="card lilac small" role="status" style={{ padding: 18 }}>
                Serie en construcción: faltan {fmtNumber(data.sinLeer)} proyectos por leer del Senado. Cada captura diaria lee los que alcanza, empezando por los más recientes; las cifras de esta página
                cubren los {fmtNumber(bills.length)} ya leídos.
              </p>
            )}
            <section className="kpis" aria-label="Resumen">
              <div className="kpi rise d1">
                <span className="lbl">Leyes publicadas desde el 11 de marzo de 2022</span>
                <span className="bignum">{fmtNumber(laws.length)}</span>
                {fLeyes && <span><Prov info={toProv(fLeyes)} /></span>}
              </div>
              <div className="kpi rise d2">
                <span className="lbl">Lo que tarda un proyecto en ser ley (mediana)</span>
                <span className="bignum">{fDias && typeof fDias.value === "number" ? months(fDias.value) : medianAll !== null ? months(medianAll) : "—"}</span>
                <span className="tiny muted">desde que ingresa hasta que se publica</span>
                {fDias && <span><Prov info={toProv(fDias)} /></span>}
              </div>
              <div className="kpi rise d3">
                <span className="lbl">Proyectos del Gobierno que llegan a ser ley</span>
                <span className="bignum">{pct(mens.leyes, mens.presentados)}%</span>
                <span className="tiny muted">{fmtNumber(mens.leyes)} de {fmtNumber(mens.presentados)} presentados desde 2022</span>
              </div>
              <div className="kpi rise d4">
                <span className="lbl">Mociones de parlamentarios que llegan a ser ley</span>
                <span className="bignum">{pct(moc.leyes, moc.presentados)}%</span>
                <span className="tiny muted">{fmtNumber(moc.leyes)} de {fmtNumber(moc.presentados)} presentadas desde 2022</span>
              </div>
            </section>

            <section className="card" style={{ gap: 14 }} aria-labelledby="prof-t">
              <div>
                <span className="kicker">Profundidad</span>
                <h2 id="prof-t" className="sec-title">¿Leyes de fondo o de forma?</h2>
              </div>
              <p style={{ color: "var(--ink-2)", maxWidth: "46em" }}>
                {laws.length ? (
                  <>
                    De las {fmtNumber(laws.length)} leyes publicadas, {fmtNumber(depth.estructural + depth.sectorial)} ({pct(depth.estructural + depth.sectorial, laws.length)}%) cambian un sector o un sistema completo y {fmtNumber(depth.simbolica)} ({pct(depth.simbolica, laws.length)}%) son simbólicas: días conmemorativos, nombres, monumentos o nacionalidades por gracia.
                  </>
                ) : (
                  "Aún no hay leyes publicadas en la serie."
                )}
              </p>
              <div className="stack" role="img" aria-label={(Object.keys(depth) as (Profundidad | "sin")[]).map((k) => `${k === "sin" ? "Sin clasificar" : PROFUNDIDAD[k].label}: ${depth[k]}`).join(", ")}>
                {(Object.keys(depth) as (Profundidad | "sin")[]).filter((k) => depth[k]).map((k) => (
                  <span key={k} className="growY" style={{ flex: depth[k], background: COLORS[k] }} />
                ))}
              </div>
              <div className="legend">
                {(["simbolica", "ajuste", "sectorial", "estructural", "sin"] as const).filter((k) => depth[k]).map((k) => (
                  <Link key={k} href={`/leyes/?st=ley&p=${k}`}>
                    <span className="sw" style={{ background: COLORS[k] }} />
                    <span>
                      <strong>{k === "sin" ? "Sin clasificar" : PROFUNDIDAD[k].label}</strong> · {fmtNumber(depth[k])} ({pct(depth[k], laws.length)}%)
                      <span className="tiny muted" style={{ display: "block" }}>{k === "sin" ? "Falta el borrador o la regla." : PROFUNDIDAD[k].que}</span>
                    </span>
                  </Link>
                ))}
              </div>
              <p className="tiny muted">
                Las simbólicas y la Ley de Presupuestos se clasifican con reglas publicadas. {ia ? `Las otras ${fmtNumber(ia)} son un borrador de IA, pendiente de revisión, hecho solo con el registro oficial de cada proyecto. ` : ""}
                <Link href="/metodos/#profundidad">Cómo se clasifica</Link>.
              </p>
            </section>

            <LeyesExplorer />
          </>
        ) : (
          <div className="card">
            <h2 className="sec-title">Las leyes se publican con la próxima captura</h2>
            <p style={{ color: "var(--ink-2)" }}>El conector lee cada proyecto en el servicio público de tramitación del Senado y sus autores en la Cámara.</p>
          </div>
        )}

        <details className="card small" style={{ gap: 8 }}>
          <summary style={{ fontWeight: 700, cursor: "pointer", minHeight: 32 }}>Cómo leer esta página</summary>
          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6, color: "var(--ink-2)" }}>
            <li>Un Mensaje es un proyecto del Presidente; una Moción, de diputados o senadores. Una moción puede tener hasta 10 autores.</li>
            <li>El tiempo hasta ser ley va del ingreso a la publicación en el Diario Oficial. Se compara con leyes de la misma profundidad: un día conmemorativo y una reforma de pensiones no comparten reloj.</li>
            <li>Muchos proyectos quedan en tramitación por años sin moverse. «En tramitación» no significa que alguien esté trabajando en ellos.</li>
            <li>El indicador de impacto suma lo que se puede leer hoy: a quién alcanza, si es permanente, si crea derechos o deberes, si crea instituciones. El costo fiscal se agregará con los informes financieros.</li>
          </ul>
          <Link href="/metodos/">Métodos completos</Link>
        </details>
        <Footer />
      </main>
    </>
  );
}
