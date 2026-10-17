import type { Metadata } from "next";
import Link from "next/link";
import { Header, Footer } from "@/components/Header";
import { CongresoView, type PeriodView } from "@/components/CongresoView";
import { congresoData, analysisFor } from "@/lib/congreso/load";
import { partyOn } from "@/lib/congreso/types";
import { partyColors } from "@/lib/congreso/colors";

export const metadata: Metadata = { title: "Cómo vota el Congreso" };

export default function Congreso() {
  const data = congresoData();
  const periods: PeriodView[] = [];
  for (const p of [...(data?.periodos ?? [])].sort((a, b) => b.id - a.id)) {
    const a = analysisFor(p.id);
    if (!a) continue;
    const diputados: PeriodView["diputados"] = {};
    for (const d of p.diputados) diputados[d.id] = [d.nombre, partyOn(d, a.asOf) ?? "SIN"];
    const nombres = Object.fromEntries(p.diputados.flatMap((d) => d.militancias.map((m) => [m.alias, m.nombre || m.alias])));
    periods.push({ id: p.id, nombre: p.nombre, analysis: a, diputados, nombres });
  }
  const colors = partyColors(periods.map((P) => P.analysis));

  return (
    <>
      <Header current="/congreso" />
      <main className="wrap">
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span className="kicker">Cómo vota el Congreso</span>
          <h1 className="display" style={{ fontSize: "clamp(34px, 7cqi, 56px)", maxWidth: "20ch" }}>
            Quién vota con quién, y <em>qué tan unidos</em>
          </h1>
          <p style={{ fontSize: 18, color: "var(--ink-2)", maxWidth: "46em" }}>
            Partidos, bloques y disciplina, calculados con cada voto registrado en la Sala de la Cámara. Mismas reglas para todos los partidos; el método está al pie de cada
            gráfico. Para revisar una votación en particular, usa el <Link href="/votaciones">explorador de votaciones</Link>.
          </p>
        </section>
        {periods.length ? (
          <CongresoView periods={periods} colors={colors} />
        ) : (
          <div className="card">
            <h2 className="sec-title">Se publica con la próxima captura</h2>
            <p style={{ color: "var(--ink-2)" }}>Los análisis se calculan cada mañana con las votaciones descargadas de la Cámara.</p>
          </div>
        )}
        <Footer />
      </main>
    </>
  );
}
