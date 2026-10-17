/**
 * Writes the open-data files served with the static site under /datos/:
 * facts.json (every published fact with sources and checks), verification-report.json, snapshot.json, ai-snapshot.json.
 */
import fs from "node:fs";
import path from "node:path";
import { loadFacts } from "../lib/facts";

const out = path.join(process.cwd(), "public", "datos");
fs.mkdirSync(out, { recursive: true });
const store = path.join(process.cwd(), "data", "store");

const facts = loadFacts({ fresh: true }).filter((f) => f.status !== "pendiente");
fs.writeFileSync(path.join(out, "facts.json"), JSON.stringify({ generatedAt: new Date().toISOString(), count: facts.length, facts }, null, 2));

for (const name of ["verification-report.json", "snapshot.json", "ai-snapshot.json"]) {
  const src = path.join(store, name);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(out, name));
}
console.log(`Datos abiertos exportados: ${facts.length} datos → public/datos/`);
