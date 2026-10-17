/**
 * Re-runs every verification over seed + ingested data and writes data/store/verification-report.json.
 * Fails (exit 1) if any fact the UI relies on is not displayable, or if any check fails.
 * Runs before every `next build`, so a broken or drifted number can't ship.
 */
import fs from "node:fs";
import path from "node:path";
import { loadFacts } from "../lib/facts";
import { STATUS_ORDER } from "../lib/provenance/types";
import { REQUIRED_FACTS } from "../lib/required";

const facts = loadFacts({ fresh: true });
const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, facts.filter((f) => f.status === s).length]));
const failedChecks = facts.flatMap((f) => f.checks.filter((c) => !c.passed).map((c) => ({ fact: f.id, check: c.id, detail: c.detail ?? c.description })));
const missingRequired = REQUIRED_FACTS.filter((id) => {
  const f = facts.find((x) => x.id === id);
  return !f || f.status === "pendiente";
});

const report = {
  generatedAt: new Date().toISOString(),
  totalFacts: facts.length,
  totalChecks: facts.reduce((a, f) => a + f.checks.length, 0),
  byStatus: counts,
  failedChecks,
  missingRequired,
};
const out = path.join(process.cwd(), "data", "store", "verification-report.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n");

console.log(`Verificados ${report.totalFacts} datos con ${report.totalChecks} comprobaciones.`);
for (const s of STATUS_ORDER) console.log(`  ${s.padEnd(12)} ${counts[s]}`);
if (failedChecks.length) {
  console.error("\nComprobaciones fallidas:");
  for (const f of failedChecks) console.error(`  ✗ ${f.fact} · ${f.check}: ${f.detail}`);
}
if (missingRequired.length) console.error(`\nDatos requeridos no disponibles: ${missingRequired.join(", ")}`);
if (failedChecks.length || missingRequired.length) process.exit(1);
console.log("\nTodo verificado.");
