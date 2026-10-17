import type { Metadata } from "next";
import { Header, Footer } from "@/components/Header";
import { DiputadosView, type DipPeriod } from "@/components/DiputadosView";
import { congresoData, analysisFor } from "@/lib/congreso/load";
import { partyOn } from "@/lib/congreso/types";
import { partyColors } from "@/lib/congreso/colors";

export const metadata: Metadata = { title: "Diputadas y diputados" };

export default function Diputados() {
  const data = congresoData();
  const periods: DipPeriod[] = [];
  for (const p of [...(data?.periodos ?? [])].sort((a, b) => b.id - a.id)) {
    const a = analysisFor(p.id);
    if (!a) continue;
    const stats = new Map(a.diputados.map((s) => [s.id, s]));
    const pos = new Map(a.mapa.points.map((pt) => [pt.id, pt]));
    const col = new Map(a.colegas.map((c) => [c.id, c]));
    periods.push({
      id: p.id,
      nombre: p.nombre,
      rows: p.diputados
        .map((d) => {
          const s = stats.get(d.id);
          const voted = s ? s.favor + s.contra + s.abst : 0;
          return {
            id: d.id,
            nombre: d.nombre,
            partido: partyOn(d, a.asOf) ?? "SIN",
            militancias: d.militancias.map((m) => [m.desde, m.hasta, m.alias] as [string, string, string]),
            registradas: s?.registradas ?? 0,
            participacion: s && s.registradas ? voted / s.registradas : null,
            linea: s && s.comparables >= 10 ? s.conPartido / s.comparables : null,
            comparables: s?.comparables ?? 0,
            ganador: s && s.conResultado ? s.ladoGanador / s.conResultado : null,
            x: pos.get(d.id)?.x ?? null,
            y: pos.get(d.id)?.y ?? null,
            cercanos: (col.get(d.id)?.cercanos ?? []).map((c) => ({ id: c.id, share: c.share })),
            lejanos: (col.get(d.id)?.lejanos ?? []).map((c) => ({ id: c.id, share: c.share })),
          };
        })
        .filter((r) => r.registradas > 0),
    });
  }
  const colors = partyColors((data?.periodos ?? []).map((p) => analysisFor(p.id)).filter((a) => a !== null));
  // Fichas with curated promises (data/seed/fichas) link to their page.
  const curated: Record<string, string> = { "10:1129": "/promesas" };

  return (
    <>
      <Header current="/diputados" />
      <main className="wrap">
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span className="kicker">Diputadas y diputados</span>
          <h1 className="display" style={{ fontSize: "clamp(34px, 7cqi, 56px)", maxWidth: "20ch" }}>
            Una ficha para <em>cada</em> integrante de la Cámara
          </h1>
          <p style={{ fontSize: 18, color: "var(--ink-2)", maxWidth: "46em" }}>
            Cuánto vota, qué tan seguido sigue a su partido, con quién coincide y en qué se diferencia de cualquier otra persona. Todo calculado con sus votos en Sala.
          </p>
        </section>
        {periods.length ? (
          <DiputadosView periods={periods} colors={colors} curated={curated} />
        ) : (
          <div className="card"><h2 className="sec-title">Se publica con la próxima captura</h2></div>
        )}
        <Footer />
      </main>
    </>
  );
}
