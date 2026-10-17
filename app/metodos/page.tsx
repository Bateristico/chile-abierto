import type { Metadata } from "next";
import Link from "next/link";
import { Header, Footer } from "@/components/Header";
import { RULE_LIST } from "@/lib/leyes/clasificacion";
import { PROFUNDIDAD } from "@/lib/leyes/labels";

export const metadata: Metadata = { title: "Métodos" };

const Sec = ({ id, kicker, title, children }: { id: string; kicker: string; title: string; children: React.ReactNode }) => (
  <section id={id} className="card" style={{ gap: 12, scrollMarginTop: 24 }} aria-labelledby={`${id}-t`}>
    <div>
      <span className="kicker">{kicker}</span>
      <h2 id={`${id}-t`} className="sec-title">{title}</h2>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 10, color: "var(--ink-2)", maxWidth: "52em" }}>{children}</div>
  </section>
);

export default function Metodos() {
  return (
    <>
      <Header current="/metodos" />
      <main className="wrap">
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span className="kicker">Métodos</span>
          <h1 className="display" style={{ fontSize: "clamp(34px, 7cqi, 56px)", maxWidth: "22ch" }}>
            Cómo medimos, <em>y lo que no medimos</em>
          </h1>
          <p style={{ fontSize: 18, color: "var(--ink-2)", maxWidth: "46em" }}>
            No hay una nota única por político ni un ranking de «mejores». Cada ángulo se mide por separado y se lee contra algo que cualquiera puede revisar: lo que prometieron, lo
            típico de la Cámara, sus pares y su propio pasado. Las mismas reglas valen para el Gobierno y la oposición.
          </p>
        </section>

        <Sec id="lecturas" kicker="Lecturas" title="De un número a una palabra">
          <p>Cada número lleva una lectura en una escala fija. Para los ángulos que se comparan con la Cámara, la escala usa los cuartiles del mismo periodo: bajo el 25% de los valores es «baja», sobre el 75% es «alta», y entremedio, «típica». Si hay menos de ocho casos para comparar, no hay lectura.</p>
          <p>Una lectura alta o baja no es buena ni mala por sí sola. Votar casi siempre con el partido puede ser disciplina o falta de criterio propio; presentar muchos proyectos puede ser trabajo o volumen.</p>
        </Sec>

        <Sec id="efectividad" kicker="Efectividad" title="¿Sus proyectos llegan a ser ley?">
          <p>Se cuentan las mociones que cada diputada o diputado presentó o firmó durante el periodo, según la lista de autores de la Cámara, y su estado según el Senado: ley publicada, en trámite, archivada, retirada o rechazada.</p>
          <p>Una moción puede tener hasta 10 autores y cada uno la cuenta. Los proyectos del Gobierno (mensajes) no se atribuyen a parlamentarios, aunque los hayan impulsado. La tasa solo se lee con al menos cinco mociones.</p>
          <p>Lo que no mide: la calidad de un proyecto, el trabajo en comisiones, las indicaciones que cambian proyectos ajenos ni los proyectos recientes que aún no tuvieron tiempo.</p>
        </Sec>

        <Sec id="velocidad" kicker="Velocidad" title="¿Cuánto tarda?">
          <p>Días entre el ingreso del proyecto y su publicación en el Diario Oficial. Cada ley se compara con las leyes de su misma profundidad publicadas desde marzo de 2022: «rápida» si está en el 25% más rápido, «lenta» si está en el 25% más lento.</p>
          <p>Las urgencias se cuentan cada vez que el Gobierno las pone o renueva: simple (30 días), suma (15) o discusión inmediata (6), según la Ley Orgánica del Congreso.</p>
        </Sec>

        <Sec id="profundidad" kicker="Profundidad" title="¿Leyes de fondo o de forma?">
          <p>Cada ley tiene una de cuatro clases:</p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {Object.values(PROFUNDIDAD).map((p) => <li key={p.label}><strong>{p.label}:</strong> {p.que}</li>)}
          </ul>
          <p>Los casos claros los decide una regla publicada, sobre el título oficial:</p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {RULE_LIST.map((r) => <li key={r.id}><code>{r.id}</code> → {PROFUNDIDAD[r.profundidad].label}: {r.razon}</li>)}
          </ul>
          <p>El resto es un <strong>borrador de IA, pendiente de revisión</strong>, y se muestra con esa etiqueta. La IA trabaja solo con el registro oficial del proyecto (título, materias, tipo de iniciativa y señales de tramitación como Comisión Mixta o control del Tribunal Constitucional), debe dar su razón y, ante la duda, elegir la clase menor. Cuando un editor lo revise, la etiqueta cambia.</p>
        </Sec>

        <Sec id="impacto" kicker="Impacto" title="El indicador de impacto">
          <p>Cinco niveles, de mínimo a muy alto, armados con partes que se muestran por separado: a quién alcanza, si es permanente, si crea derechos o deberes, y si crea o cambia instituciones. La profundidad cuenta como una parte más. Si se conocen menos de dos partes, el indicador dice «sin datos» en vez de adivinar.</p>
          <p>Falta el dinero: el costo fiscal se leerá de los informes financieros de cada proyecto en una próxima etapa.</p>
        </Sec>

        <Sec id="presencia" kicker="Presencia e independencia" title="Participación y voto con el partido">
          <p>Participación: votaciones en que marcó a favor, en contra o abstención, sobre las votaciones en que aparece registrado. Con su partido: veces que votó igual que la mayoría de los demás miembros de su partido ese día (al menos tres), sobre las votaciones comparables.</p>
          <p>Lo que no mide: licencias médicas, pareos ni comisiones. Un «no vota» puede ser una decisión política.</p>
        </Sec>

        <Sec id="ia" kicker="Inteligencia artificial" title="Qué hace la IA y qué no">
          <p>La IA propone; las reglas verifican. Cada cifra que escribe debe coincidir con un dato verificado que cita, o con una operación simple que el sitio recalcula; cada fecha debe estar en esos datos. Si no, se descarta. Un segundo modelo revisa que no exagere ni atribuya causas. Lo descartado y su motivo se publica en <Link href="/fuentes">Fuentes</Link>.</p>
        </Sec>
        <Footer />
      </main>
    </>
  );
}
