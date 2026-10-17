import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { Header, Footer } from "@/components/Header";
import { PromiseExplorer, type PromiseData } from "@/components/PromiseExplorer";
import { dataMode } from "@/lib/facts";
import type { ProvInfo } from "@/lib/provenance/view";

export const metadata: Metadata = { title: "Promesas vs votos" };

function readJson<T>(p: string): T | null {
  return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, "utf8")) as T) : null;
}

const DEMO_PROV: ProvInfo = {
  id: "demo.promesas",
  status: "ejemplo",
  label: "Datos de esta vista",
  value: "Ficticios",
  definition: "Persona, partidos, promesas y votos inventados para mostrar el diseño. No se mezclan con datos reales.",
  reason: "Se reemplazan al ejecutar los conectores de la Cámara y la extracción de promesas.",
  sources: [],
  checks: [],
};

export default function Promesas() {
  const dir = path.join(process.cwd(), "data");
  const camara = readJson<{ at: string; diputados: unknown[]; votaciones: unknown[]; votos: unknown[] }>(path.join(dir, "store", "camara.records.json"));
  const promisesDir = path.join(dir, "store", "promises");
  const extracted = fs.existsSync(promisesDir) ? fs.readdirSync(promisesDir).filter((f) => f.endsWith(".json")).length : 0;
  const demo = readJson<PromiseData>(path.join(dir, "demo", "promises.json"));
  const live = dataMode() === "live";

  return (
    <>
      <Header current="/promesas" />
      <div className="wrap" style={{ paddingBottom: 0 }}>
        <section className="card" aria-labelledby="estado">
          <h2 id="estado" style={{ fontSize: 22 }}>Estado de los datos de esta sección</h2>
          <ul className="small" style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
            <li>
              <strong>Votaciones de la Cámara:</strong>{" "}
              {camara
                ? `${camara.diputados.length} diputados, ${camara.votaciones.length} votaciones y ${camara.votos.length} votos individuales cargados (cada votación cuadrada con sus totales oficiales).`
                : "pendiente. Se cargan con «npm run ingest camara» desde opendata.camara.cl."}
            </li>
            <li>
              <strong>Promesas de campaña:</strong>{" "}
              {extracted ? `${extracted} programas procesados; solo se aceptan promesas cuya cita aparece textual en el PDF.` : "pendiente. Se extraen con «npm run extract-promises» desde los programas oficiales."}
            </li>
            <li>
              <strong>Relación promesa–voto:</strong> la propone un agente y la confirma un editor antes de publicarse.
            </li>
          </ul>
        </section>
      </div>
      {!live && demo ? (
        <PromiseExplorer data={demo} demoProv={DEMO_PROV} />
      ) : (
        <main className="wrap">
          <div className="card">
            <h1 style={{ fontSize: 30 }}>Aún no hay promesas verificadas para mostrar</h1>
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
