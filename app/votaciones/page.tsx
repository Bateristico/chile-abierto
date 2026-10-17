import type { Metadata } from "next";
import { Header, Footer } from "@/components/Header";
import { VotacionesExplorer } from "@/components/VotacionesExplorer";
import { Prov } from "@/components/Prov";
import { congresoData } from "@/lib/congreso/load";
import { isClose, isUnanimous } from "@/lib/congreso/metrics";
import { maybeFact } from "@/lib/facts";
import { toProv } from "@/lib/provenance/view";
import { fmtNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Votaciones" };

export default function Votaciones() {
  const data = congresoData();
  const periodos = (data?.periodos ?? []).map((p) => ({ id: p.id, nombre: p.nombre, votaciones: p.votaciones.length })).sort((a, b) => b.id - a.id);
  const actual = data?.periodos.find((p) => p.id === periodos[0]?.id);
  const stats = actual && {
    total: actual.votaciones.length,
    cerca: actual.votaciones.filter((v) => isClose(v)).length,
    rechazadas: actual.votaciones.filter((v) => /rechazad/i.test(v.r)).length,
    unanimes: actual.votaciones.filter(isUnanimous).length,
  };
  const fact = actual ? maybeFact(`congreso.p${actual.id}.votaciones`) : undefined;

  return (
    <>
      <Header current="/votaciones" />
      <main className="wrap">
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span className="kicker">Votaciones de la Cámara</span>
          <h1 className="display" style={{ fontSize: "clamp(34px, 7cqi, 56px)", maxWidth: "20ch" }}>
            Cada votación, <em>voto a voto</em>
          </h1>
          <p style={{ fontSize: 18, color: "var(--ink-2)", maxWidth: "46em" }}>
            Todas las votaciones en Sala desde marzo de 2022, con el voto de cada diputada y diputado y el partido al que pertenecía ese día. Filtra por tema, resultado o
            partido, o elige a alguien para ver cómo votó.
          </p>
        </section>

        {stats && actual && (
          <section className="kpis" aria-label={`Periodo ${actual.nombre}`}>
            <div className="kpi rise d1"><span className="lbl">Votaciones en Sala, {actual.nombre}</span><span className="bignum">{fmtNumber(stats.total)}</span>{fact && <span><Prov info={toProv(fact)} /></span>}</div>
            <div className="kpi rise d2"><span className="lbl">Se decidieron por 5 votos o menos</span><span className="bignum">{fmtNumber(stats.cerca)}</span><span className="tiny muted">{Math.round((stats.cerca / stats.total) * 100)}% del total</span></div>
            <div className="kpi rise d3"><span className="lbl">Rechazadas</span><span className="bignum">{fmtNumber(stats.rechazadas)}</span><span className="tiny muted">según el resultado publicado</span></div>
            <div className="kpi rise d4"><span className="lbl">Sin un solo voto en contra ni abstención</span><span className="bignum">{fmtNumber(stats.unanimes)}</span><span className="tiny muted">{Math.round((stats.unanimes / stats.total) * 100)}% del total</span></div>
          </section>
        )}

        {periodos.length ? (
          <VotacionesExplorer periodos={periodos} />
        ) : (
          <div className="card">
            <h2 className="sec-title">Las votaciones se publican con la próxima captura</h2>
            <p style={{ color: "var(--ink-2)" }}>El conector de la Cámara descarga cada votación y su detalle cada mañana.</p>
          </div>
        )}

        <details className="card small" style={{ gap: 8 }}>
          <summary style={{ fontWeight: 700, cursor: "pointer", minHeight: 32 }}>Cómo leer estas votaciones</summary>
          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6, color: "var(--ink-2)" }}>
            <li>Solo se muestran votaciones cuyo detalle de votos suma exactamente los totales que publica la Cámara.</li>
            <li>«No vota» significa que la persona estaba registrada en la votación pero no marcó opción; «Sin registro», que no aparece en el detalle (puede ser una licencia, un pareo o una ausencia).</li>
            <li>El partido de cada diputado es el de su militancia en la fecha de la votación, según el registro de la Cámara. Los independientes aparecen como IND.</li>
            <li>El resultado es el que publica la Cámara en su listado anual. Una votación con más votos a favor puede ser rechazada si exigía un quórum especial.</li>
          </ul>
        </details>
        <Footer />
      </main>
    </>
  );
}
