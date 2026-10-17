/**
 * npm run extract-programs
 *
 * Runs the verbatim-quote promise extractor over every program listed in data/seed/programas-2025.json
 * (the presidential programs filed with the Servel). Skips programs already extracted. One failure does not stop the rest.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const list = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "seed", "programas-2025.json"), "utf8")) as {
  programas: { candidatura: string; slug: string; url: string }[];
};
const outDir = path.join(process.cwd(), "data", "store", "promises");
let failed = 0;
for (const p of list.programas) {
  if (fs.existsSync(path.join(outDir, `${p.slug}.json`))) {
    console.log(`– ${p.candidatura}: ya extraído`);
    continue;
  }
  console.log(`→ ${p.candidatura}`);
  try {
    execFileSync("npx", ["tsx", "scripts/extract-promises.ts", "--url", p.url, "--publisher", "servel", "--author", p.candidatura, "--slug", p.slug], { stdio: "inherit" });
  } catch {
    failed++;
    console.log(`  no se pudo extraer (puede ser un PDF escaneado sin texto)`);
  }
}
console.log(`\n${list.programas.length - failed} de ${list.programas.length} programas procesados.`);
