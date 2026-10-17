import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { Header, Footer } from "@/components/Header";
import { PromiseExplorer, type PromiseData } from "@/components/PromiseExplorer";
import { Hemicycle } from "@/components/Hemicycle";
import { Prov } from "@/components/Prov";
import { dataMode } from "@/lib/facts";
import { camaraComposition, programas } from "@/lib/camara-view";
import { toProv, type ProvInfo } from "@/lib/provenance/view";
import { fmtDate, fmtNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Promesas y votos" };

function readJson<T>(p: string): T | null {
  return fs.existsSync(/*turbopackIgnore: true*/ p) ? (JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ p, "utf8")) as T) : null;
}

const DEMO_PROV: ProvInfo = {
  id: "demo.promesas",
  status: "ejemplo",
  label: "Datos de esta vista",
  value: "Ficticios",
  definition: "Persona, partidos, promesas y votos inventados para mostrar el diseño. No se mezclan con datos reales.",
  reason: "Se reemplazan cuando un editor confirme la relación entre promesas extraídas y votaciones reales.",
  sources: [],
  checks: [],
};

export default function Promesas() {
  const dir = path.join(process.cwd(), "data");
  const camaraRec = readJson<{ at: string; votos: unknown[]; cuarentena?: string[] }>(path.join(dir, "store", "camara.records.json"));
  const demo = readJson<PromiseData>(path.join(dir, "demo", "promises.json"));
  const live = dataMode() === "live";
  const camara = camaraComposition();
  const progs = programas();
  const extracted = progs.items.filter((p) => p.extracted);

  return (
    <>
      <Header current="/promesas" />
      <main className="wrap" style={{ paddingBottom: 0 }}>
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span className="kicker">Promesas y votos</span>
          <h1 className="display" style={{ fontSize: "clamp(34px, 7cqi, 56px)", maxWidth: "20ch" }}>
            Lo que prometieron, al lado de <em>cómo votan</em>
          </h1>
          <p style={{ fontSize: 18, color: "var(--ink-2)", maxWidth: "44em" }}>
            Votos desde los datos abiertos de la Cámara, cuadrados uno a uno con los totales oficiales. Promesas citadas textual desde los programas inscritos en el Servel.
          </p>
        </section>

        <section className="row" style={{ alignItems: "stretch" }}>
          <div className="card night rise d1" style={{ flex: "999 1 520px", minWidth: 0 }}>
            <span className="kicker on-night">La Cámara hoy</span>
            {camara ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "center" }}>
                <div style={{ flex: "1 1 300px", minWidth: 0 }}>
                  <Hemicycle dark groups={camara.parties.map((p) => ({ key: p.key, label: p.label, n: p.n, color: p.color }))} label={`Composición por partido: ${camara.parties.map((p) => `${p.alias} ${p.n}`).join(", ")}`} />
                </div>
                <div style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {camara.parties.map((p) => (
                    <div key={p.key} style={{ display: "grid", gridTemplateColumns: "12px minmax(0, 1fr) auto", gap: 10, alignItems: "center", fontSize: 14 }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: p.color }} />
                      <span style={{ color: "var(--night-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.label}>{p.label}</span>
                      <strong>{p.n}</strong>
                    </div>
                  ))}
                  <span className="tiny" style={{ color: "#A9AAB6", marginTop: 6 }}>Por militancia vigente en el registro de la Cámara, de mayor a menor. El orden no indica posición política.</span>
                  <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Prov info={toProv(camara.total)} />
                    {camara.women && <Prov info={toProv(camara.women)} />}
                  </span>
                </div>
              </div>
            ) : (
              <p style={{ color: "var(--night-ink)" }}>La composición se publica cuando el conector de la Cámara completa su captura diaria sin problemas.</p>
            )}
          </div>

          <div className="card rise d2" style={{ flex: "1 1 320px", minWidth: 0 }}>
            <span className="kicker">Votaciones</span>
            {camara?.votaciones ? (
              <>
                <span className="bignum" style={{ fontSize: 48 }}>{fmtNumber(camara.votaciones.value as number)}</span>
                <span style={{ color: "var(--ink-2)" }}>votaciones en {camara.votaciones.id.slice(-4)}</span>
                {camara.cuadradas && (
                  <>
                    <div className="progress" style={{ background: "var(--ground)" }} role="img" aria-label="Votaciones que cuadran con sus totales">
                      <span className="grow d3" style={{ width: `${((camara.cuadradas.value as number) / (camara.votaciones.value as number)) * 100}%` }} />
                    </div>
                    <span className="small" style={{ color: "var(--ink-2)" }}>
                      <strong>{fmtNumber(camara.cuadradas.value as number)}</strong> cuadran voto a voto con los totales oficiales
                      {camaraRec?.cuarentena?.length ? `; ${camaraRec.cuarentena.length} en cuarentena por errores en la fuente` : ""}.
                    </span>
                  </>
                )}
                {camaraRec && <span className="tiny muted">{fmtNumber(camaraRec.votos.length)} votos individuales cargados.</span>}
                <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Prov info={toProv(camara.votaciones)} />
                  {camara.cuadradas && <Prov info={toProv(camara.cuadradas)} align="right" />}
                </span>
              </>
            ) : (
              <p className="small" style={{ color: "var(--ink-2)" }}>Pendiente de la captura diaria desde opendata.camara.cl.</p>
            )}
          </div>
        </section>

        <section className="card rise d3" aria-labelledby="progs">
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: "8px 24px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="kicker">Fuente de las promesas</span>
              <h2 id="progs" className="sec-title">Programas presidenciales 2025 inscritos en el Servel</h2>
            </div>
            <span className="small muted">
              {extracted.length
                ? `${extracted.length} de ${progs.items.length} procesados · solo se aceptan citas que aparecen textual en el PDF`
                : `${progs.items.length} programas oficiales · consultados el ${fmtDate(progs.retrievedAt)}`}
            </span>
          </div>
          <div className="programs">
            {progs.items.map((p) => (
              <a key={p.slug} href={p.url} target="_blank" rel="noopener noreferrer" className="program">
                <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 12, background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#B5362E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7" /></svg>
                </span>
                <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <strong>{p.candidatura}</strong>
                  <span className="tiny muted">{p.extracted ? `${p.extracted.accepted} promesas con cita verificada` : "Programa de gobierno · PDF Servel"}</span>
                </span>
              </a>
            ))}
          </div>
        </section>

        {!live && demo && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            <span className="kicker">Así se verá cada parlamentario</span>
            <h2 className="sec-title">Ficha de ejemplo</h2>
          </div>
        )}
      </main>
      {!live && demo ? (
        <PromiseExplorer data={demo} demoProv={DEMO_PROV} />
      ) : (
        <main className="wrap">
          <div className="card">
            <h2 className="sec-title">Aún no hay promesas verificadas para mostrar</h2>
            <p style={{ color: "var(--ink-2)" }}>Cuando un editor confirme la relación entre promesas y votos, aparecerán aquí.</p>
          </div>
        </main>
      )}
      <div className="wrap" style={{ paddingTop: 0 }}>
        <Footer />
      </div>
    </>
  );
}
