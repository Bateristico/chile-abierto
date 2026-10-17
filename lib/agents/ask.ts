import Anthropic from "@anthropic-ai/sdk";
import { loadFacts } from "../facts";
import { allFindings } from "../findings/rules";
import { fmtFact, STATUS_LABEL } from "../format";
import type { Fact } from "../provenance/types";
import { getPublisher } from "../provenance/sources";
import { checkGrounding } from "./grounding";

export interface AskStep {
  agent: string;
  did: string;
}
export interface AskResult {
  answer: string;
  citations: { id: string; label: string; value: string; status: string; sources: { name: string; url: string }[] }[];
  steps: AskStep[];
  grounded: boolean;
  warnings: string[];
}

const SYSTEM = `Eres el analista de Chile Abierto. Respondes en español de Chile, claro y breve (máximo 120 palabras).
Reglas que no se rompen:
1. Solo usas cifras que te entregan las herramientas. Nunca calculas ni recuerdas cifras por tu cuenta.
2. Después de cada afirmación con una cifra pones el id del dato entre corchetes, por ejemplo [gc.gasto_total_2027].
3. Si un dato no es «oficial», lo dices ("según dos medios", "según una sola fuente").
4. Si las herramientas no tienen lo necesario, dices qué falta. No especulas.
5. Distingues correlación de causalidad. No acusas a personas.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "buscar_datos",
    description: "Busca datos verificados (presupuesto, deuda, población, tramitación) por palabras clave. Devuelve id, valor, nivel de verificación y fuentes.",
    input_schema: { type: "object", properties: { consulta: { type: "string" } }, required: ["consulta"] },
  },
  {
    name: "listar_hallazgos",
    description: "Lista los hallazgos calculados con reglas reproducibles sobre los datos verificados.",
    input_schema: { type: "object", properties: {} },
  },
];

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
}

export function searchFacts(query: string, limit = 8): Fact[] {
  const q = tokenize(query);
  return loadFacts()
    .filter((f) => f.status !== "pendiente" && f.status !== "ejemplo")
    .map((f) => {
      const hay = tokenize(`${f.id} ${f.label} ${f.definition}`);
      return { f, score: q.reduce((a, w) => a + (hay.some((h) => h.startsWith(w)) ? 1 : 0), 0) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.f);
}

const describe = (f: Fact) => ({
  id: f.id,
  dato: f.label,
  valor: fmtFact(f),
  valor_numerico: f.value,
  unidad: f.unit,
  definicion: f.definition,
  nivel: STATUS_LABEL[f.status],
  fuentes: f.sources.map((s) => getPublisher(s.publisher)?.name ?? s.publisher),
});

export async function ask(question: string): Promise<AskResult> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("El asistente no está configurado (falta ANTHROPIC_API_KEY).");
  const client = new Anthropic();
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";
  const retrieved = new Map<string, Fact>();
  const steps: AskStep[] = [{ agent: "Orquestador", did: "Entendió la pregunta y eligió qué datos buscar." }];
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];

  const runTool = (name: string, input: Record<string, unknown>): string => {
    if (name === "buscar_datos") {
      const found = searchFacts(String(input.consulta ?? ""));
      found.forEach((f) => retrieved.set(f.id, f));
      steps.push({ agent: "Agente de datos", did: `Buscó «${input.consulta}» y encontró ${found.length} datos verificados.` });
      return JSON.stringify(found.map(describe));
    }
    if (name === "listar_hallazgos") {
      const fs = allFindings().filter((f) => f.origin === "regla");
      for (const f of fs) for (const id of f.factIds) retrieved.set(id, loadFacts().find((x) => x.id === id)!);
      steps.push({ agent: "Agente de hallazgos", did: `Revisó ${fs.length} hallazgos calculados con reglas.` });
      return JSON.stringify(fs.map((f) => ({ id: f.id, titulo: f.title, nivel: STATUS_LABEL[f.status], datos: f.factIds })));
    }
    return JSON.stringify({ error: "herramienta desconocida" });
  };

  let answer = "";
  for (let turn = 0; turn < 6; turn++) {
    const res = await client.messages.create({ model, max_tokens: 1200, system: SYSTEM, tools: TOOLS, messages });
    messages.push({ role: "assistant", content: res.content });
    const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (uses.length === 0) {
      answer = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
      break;
    }
    messages.push({
      role: "user",
      content: uses.map((u) => ({ type: "tool_result" as const, tool_use_id: u.id, content: runTool(u.name, u.input as Record<string, unknown>) })),
    });
  }

  // Grounding: every number must come from a retrieved fact. One repair attempt, then flag.
  const warnings: string[] = [];
  let g = checkGrounding(answer, [...retrieved.values()]);
  if (!g.grounded) {
    steps.push({ agent: "Verificador", did: `Encontró cifras o fechas sin respaldo (${[...g.unsupported, ...(g.unsupportedDates ?? [])].join(", ")}) y pidió corregir.` });
    messages.push({
      role: "user",
      content: `Estas cifras o fechas de tu respuesta no están en los datos entregados: ${[...g.unsupported, ...(g.unsupportedDates ?? [])].join(", ")}. Reescribe la respuesta usando solo cifras de las herramientas, con sus ids.`,
    });
    const fix = await client.messages.create({ model, max_tokens: 1000, system: SYSTEM, messages });
    answer = fix.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
    g = checkGrounding(answer, [...retrieved.values()]);
    if (!g.grounded) warnings.push(`Cifras o fechas sin respaldo verificado: ${[...g.unsupported, ...(g.unsupportedDates ?? [])].join(", ")}. Trátalas con cautela.`);
  } else {
    steps.push({ agent: "Verificador", did: "Comprobó que cada cifra de la respuesta viene de un dato verificado." });
  }

  const citedIds = [...new Set([...answer.matchAll(/\[([a-z0-9_.-]+)\]/g)].map((m) => m[1]))].filter((id) => retrieved.has(id));
  const unknownIds = [...answer.matchAll(/\[([a-z0-9_.-]+)\]/g)].map((m) => m[1]).filter((id) => !retrieved.has(id));
  if (unknownIds.length) warnings.push(`La respuesta citó datos que no consultó: ${[...new Set(unknownIds)].join(", ")}.`);
  const weakCited = citedIds.map((id) => retrieved.get(id)!).filter((f) => f.status !== "oficial");
  if (weakCited.length) warnings.push(`${weakCited.length} de los datos citados no son oficiales todavía.`);

  return {
    answer,
    citations: citedIds.map((id) => {
      const f = retrieved.get(id)!;
      return { id, label: f.label, value: fmtFact(f), status: f.status, sources: f.sources.map((s) => ({ name: getPublisher(s.publisher)?.name ?? s.publisher, url: s.url })) };
    }),
    steps,
    grounded: g.grounded && unknownIds.length === 0,
    warnings,
  };
}
