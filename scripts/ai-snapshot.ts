/**
 * npm run ai-snapshot
 *
 * Generates the AI layer of the static site from the verified data of this snapshot:
 *  - insights: proposed by Claude, kept only if they pass the deterministic gate (citations + numeric grounding)
 *    and an independent critic pass;
 *  - questions: a fixed list answered by the same agent as /hallazgos, kept only if fully grounded.
 * Without ANTHROPIC_API_KEY it does nothing and the site shows only rule-based findings.
 */
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { ask } from "../lib/agents/ask";
import { generateInsights, SNAPSHOT_QUESTIONS } from "../lib/agents/insights";

const out = path.join(process.cwd(), "data", "store", "ai-snapshot.json");
if (!process.env.ANTHROPIC_API_KEY) {
  console.log("Sin ANTHROPIC_API_KEY: no se genera la capa de IA (el sitio muestra solo hallazgos por reglas).");
  process.exit(0);
}
const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";
const client = new Anthropic();

const { accepted, rejected } = await generateInsights(client, model);
console.log(`Hallazgos IA: ${accepted.length} publicados, ${rejected.length} descartados.`);
for (const r of rejected) console.log(`  ✗ ${r.title.slice(0, 80)} — ${r.reason}`);

const qa = [];
const dropped: { question: string; reason: string }[] = [];
for (const question of SNAPSHOT_QUESTIONS) {
  try {
    const res = await ask(question);
    if (res.grounded && res.citations.length) qa.push({ question, ...res });
    else dropped.push({ question, reason: res.warnings.join(" ") || "Sin citas verificadas" });
  } catch (e) {
    dropped.push({ question, reason: (e as Error).message });
  }
}
console.log(`Preguntas: ${qa.length} respondidas con respaldo, ${dropped.length} descartadas.`);

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(
  out,
  JSON.stringify({ generatedAt: new Date().toISOString(), model, insights: accepted, rejectedInsights: rejected, qa, droppedQuestions: dropped }, null, 2) + "\n",
);
console.log(`→ ${path.relative(process.cwd(), out)}`);
