/**
 * npm run ingest [-- connectorId ...] [--year 2026]
 *
 * For each connector: download from the official publisher (raw copy + sha256 in data/raw), parse, reconcile.
 * A connector with issues publishes nothing: its issues go to data/store/<id>.issues.json for human review.
 * After writing, the whole dataset is re-verified; if anything fails, the new files are rolled back.
 */
import fs from "node:fs";
import path from "node:path";
import { CONNECTORS } from "../lib/connectors";
import { loadFacts } from "../lib/facts";

const STORE = path.join(process.cwd(), "data", "store");
fs.mkdirSync(STORE, { recursive: true });

const args = process.argv.slice(2);
const yearIdx = args.indexOf("--year");
const year = yearIdx >= 0 ? Number(args[yearIdx + 1]) : new Date().getFullYear();
const wanted = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--year");
const selected = CONNECTORS.filter((c) => wanted.length === 0 || wanted.includes(c.id));

function writeAtomic(file: string, data: unknown, backups: Map<string, string | null>) {
  if (!backups.has(file)) backups.set(file, fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null);
  fs.writeFileSync(file + ".tmp", JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(file + ".tmp", file);
}

const backups = new Map<string, string | null>();
let failures = 0;
const status: { id: string; status: "ok" | "issues" | "error" | "skipped"; detail: string }[] = [];

for (const c of selected) {
  const missing = (c.requires ?? []).filter((k) => !process.env[k]);
  if (missing.length) {
    console.log(`– ${c.id}: omitido, faltan ${missing.join(", ")}`);
    status.push({ id: c.id, status: "skipped", detail: `Faltan credenciales: ${missing.join(", ")}` });
    continue;
  }
  process.stdout.write(`→ ${c.id}: ${c.description}… `);
  try {
    const res = await c.run({ year });
    const issuesFile = path.join(STORE, `${c.id}.issues.json`);
    if (res.issues.length) {
      failures++;
      fs.writeFileSync(issuesFile, JSON.stringify({ at: new Date().toISOString(), issues: res.issues, notes: res.notes }, null, 2) + "\n");
      console.log(`con ${res.issues.length} problemas; no se publica nada. Ver ${path.relative(process.cwd(), issuesFile)}`);
      status.push({ id: c.id, status: "issues", detail: `${res.issues.length} problemas en revisión` });
      continue;
    }
    if (fs.existsSync(issuesFile)) fs.rmSync(issuesFile);
    if (res.facts.length) writeAtomic(path.join(STORE, `${c.id}.facts.json`), res.facts, backups);
    if (res.records) writeAtomic(path.join(STORE, `${c.id}.records.json`), { at: new Date().toISOString(), ...res.records }, backups);
    console.log(`ok · ${res.facts.length} datos · ${res.notes.join(" · ")}`);
    status.push({ id: c.id, status: "ok", detail: res.notes.join(" · ") });
  } catch (err) {
    failures++;
    console.log(`error: ${(err as Error).message}`);
    status.push({ id: c.id, status: "error", detail: (err as Error).message });
  }
}

// Snapshot metadata: shown in the site footer and on /fuentes.
const ran = status.filter((s) => s.status !== "skipped");
fs.writeFileSync(
  path.join(STORE, "snapshot.json"),
  JSON.stringify({ takenAt: new Date().toISOString(), ok: ran.filter((s) => s.status === "ok").length, total: ran.length, connectors: status }, null, 2) + "\n",
);

// Re-verify everything with the new files in place; roll back on any failure.
try {
  const facts = loadFacts({ fresh: true });
  const failed = facts.flatMap((f) => f.checks.filter((c) => !c.passed).map((c) => `${f.id} · ${c.id}`));
  if (failed.length) throw new Error(`Comprobaciones fallidas tras la ingesta: ${failed.join(", ")}`);
  const upgraded = facts.filter((f) => f.status === "oficial").length;
  console.log(`\nVerificación completa: ${facts.length} datos, ${upgraded} oficiales.`);
} catch (err) {
  console.error(`\n${(err as Error).message}\nRevirtiendo los archivos escritos en esta ingesta.`);
  for (const [file, prev] of backups) prev === null ? fs.rmSync(file, { force: true }) : fs.writeFileSync(file, prev);
  process.exit(1);
}
if (failures) process.exit(2);
