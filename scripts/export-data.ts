/**
 * Writes the open-data files served with the static site under /datos/:
 * facts.json (every published fact with sources and checks), verification-report.json, snapshot.json, ai-snapshot.json.
 */
import fs from "node:fs";
import path from "node:path";
import { loadFacts } from "../lib/facts";
import { congresoData, clientPeriod, analysisFor } from "../lib/congreso/load";
import { leyesData, clientRows, pageBoletines } from "../lib/leyes/load";

const out = path.join(process.cwd(), "public", "datos");
fs.mkdirSync(out, { recursive: true });
const store = path.join(process.cwd(), "data", "store");

const facts = loadFacts({ fresh: true }).filter((f) => f.status !== "pendiente");
fs.writeFileSync(path.join(out, "facts.json"), JSON.stringify({ generatedAt: new Date().toISOString(), count: facts.length, facts }, null, 2));

for (const name of ["verification-report.json", "snapshot.json", "ai-snapshot.json"]) {
  const src = path.join(store, name);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(out, name));
}
// Roll calls for the browser explorers, one file per legislative period.
const congreso = congresoData();
if (congreso) {
  fs.mkdirSync(path.join(out, "congreso"), { recursive: true });
  for (const p of congreso.periodos) {
    fs.writeFileSync(path.join(out, "congreso", `p${p.id}.json`), JSON.stringify(clientPeriod(congreso, p)));
    fs.writeFileSync(path.join(out, "congreso", `p${p.id}-analisis.json`), JSON.stringify(analysisFor(p.id)));
  }
  console.log(`Congreso: ${congreso.periodos.map((p) => `${p.nombre} ${p.votaciones.length} votaciones`).join(" · ")}`);
}
// Bills and laws for the Leyes explorer.
const leyes = leyesData();
if (leyes) {
  fs.writeFileSync(path.join(out, "leyes.json"), JSON.stringify({ generadoEl: leyes.generadoEl, rows: clientRows(pageBoletines()) }));
  console.log(`Leyes: ${leyes.bills.length} proyectos`);
}
console.log(`Datos abiertos exportados: ${facts.length} datos → public/datos/`);
