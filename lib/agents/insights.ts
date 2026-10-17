import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { loadFacts } from "../facts";
import { fmtFact, STATUS_LABEL } from "../format";
import type { Fact } from "../provenance/types";
import { checkGrounding } from "./grounding";

export const AiInsight = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  cross: z.string().min(3).max(60),
  title: z.string().min(20).max(240),
  summary: z.string().min(20).max(600),
  factIds: z.array(z.string()).min(2).max(12),
  alternatives: z.array(z.string()).min(1).max(4),
  wouldChange: z.string().min(10),
});
export type AiInsight = z.infer<typeof AiInsight>;

export interface ValidatedInsight extends AiInsight {
  critic: string;
}

/** Facts the AI is allowed to reason over: displayable and real (no demo fixtures). */
export function usableFacts(all: Fact[] = loadFacts()): Fact[] {
  return all.filter((f) => f.status !== "pendiente" && f.status !== "ejemplo");
}

/**
 * Deterministic gate for an AI-proposed insight: schema, citations that exist, and every number in the
 * title/summary matching one of the facts it cites (not just any fact). Runs at generation and again at every build,
 * so an insight disappears if the data underneath it changes.
 */
export function validateInsight(raw: unknown, facts: Fact[]): { ok: true; insight: AiInsight } | { ok: false; reason: string } {
  const parsed = AiInsight.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: `Formato inválido: ${parsed.error.issues[0]?.message}` };
  const ins = parsed.data;
  const byId = new Map(facts.map((f) => [f.id, f]));
  const missing = ins.factIds.filter((id) => !byId.has(id));
  if (missing.length) return { ok: false, reason: `Cita datos inexistentes o no verificados: ${missing.join(", ")}` };
  const cited = ins.factIds.map((id) => byId.get(id)!);
  const g = checkGrounding(`${ins.title} ${ins.summary}`, cited);
  if (!g.grounded) return { ok: false, reason: `Cifras que no están en los datos citados: ${g.unsupported.join(", ")}` };
  return { ok: true, insight: ins };
}

const PROPOSE_TOOL: Anthropic.Tool = {
  name: "proponer_hallazgos",
  description: "Propone hallazgos no obvios que cruzan varios datos verificados.",
  input_schema: {
    type: "object",
    properties: {
      hallazgos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "slug en minúsculas con guiones" },
            cross: { type: "string", description: "Qué se cruza, p. ej. «Presupuesto y deuda»" },
            title: { type: "string", description: "Una oración con el hallazgo y sus cifras" },
            summary: { type: "string", description: "2–3 oraciones que explican por qué importa" },
            factIds: { type: "array", items: { type: "string" }, description: "ids de TODOS los datos de donde salen las cifras" },
            alternatives: { type: "array", items: { type: "string" }, description: "Explicaciones alternativas o límites" },
            wouldChange: { type: "string", description: "Qué dato nuevo cambiaría la conclusión" },
          },
          required: ["id", "cross", "title", "summary", "factIds", "alternatives", "wouldChange"],
        },
      },
    },
    required: ["hallazgos"],
  },
};

const CRITIC_TOOL: Anthropic.Tool = {
  name: "evaluar",
  description: "Evalúa cada hallazgo contra sus datos.",
  input_schema: {
    type: "object",
    properties: {
      evaluaciones: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            respaldado: { type: "boolean", description: "true solo si cada afirmación se sigue de los datos citados, sin exagerar ni inferir causas" },
            comentario: { type: "string", description: "Por qué; qué sobra o falta" },
          },
          required: ["id", "respaldado", "comentario"],
        },
      },
    },
    required: ["evaluaciones"],
  },
};

const factLine = (f: Fact) => `${f.id} | ${f.label} | ${fmtFact(f)} | ${STATUS_LABEL[f.status]} | ${f.definition.slice(0, 160)}`;

function toolInput<T>(msg: Anthropic.Message, schema: z.ZodType<T>): T | null {
  const block = msg.content.find((b) => b.type === "tool_use");
  const parsed = schema.safeParse(block && "input" in block ? block.input : null);
  return parsed.success ? parsed.data : null;
}

export async function generateInsights(client: Anthropic, model: string): Promise<{ accepted: ValidatedInsight[]; rejected: { title: string; reason: string }[] }> {
  const facts = usableFacts();
  const table = facts.map(factLine).join("\n");
  const proposal = await client.messages.create({
    model,
    max_tokens: 6000,
    tools: [PROPOSE_TOOL],
    tool_choice: { type: "tool", name: PROPOSE_TOOL.name },
    system:
      "Eres analista de finanzas públicas de Chile. Buscas conexiones no obvias entre datos verificados: proporciones, contrastes, tensiones entre metas y montos. Reglas: usa SOLO cifras de la tabla, copiadas como aparecen o redondeadas; no calcules nuevas cifras salvo que el cálculo sea trivial y sus insumos estén citados; cita en factIds cada dato usado; si un dato no es oficial, dilo; no atribuyas intenciones ni causas; no menciones cantidades que no estén en la tabla (ni siquiera conteos como «32 partidas»); no repitas lo obvio. Español de Chile, claro.",
    messages: [{ role: "user", content: `Datos verificados (id | dato | valor | nivel | definición):\n${table}\n\nPropón hasta 6 hallazgos.` }],
  });
  const raw = toolInput(proposal, z.object({ hallazgos: z.array(z.unknown()) }))?.hallazgos ?? [];

  const rejected: { title: string; reason: string }[] = [];
  const passed: AiInsight[] = [];
  for (const r of raw) {
    const v = validateInsight(r, facts);
    if (v.ok) passed.push(v.insight);
    else rejected.push({ title: (r as { title?: string })?.title ?? "(sin título)", reason: v.reason });
  }
  if (!passed.length) return { accepted: [], rejected };

  // Critic: an independent pass that only sees each insight and its cited facts.
  const byId = new Map(facts.map((f) => [f.id, f]));
  const dossier = passed
    .map((i) => `### ${i.id}\nHallazgo: ${i.title}\n${i.summary}\nDatos citados:\n${i.factIds.map((id) => factLine(byId.get(id)!)).join("\n")}`)
    .join("\n\n");
  const critique = await client.messages.create({
    model,
    max_tokens: 3000,
    tools: [CRITIC_TOOL],
    tool_choice: { type: "tool", name: CRITIC_TOOL.name },
    system: "Eres un revisor escéptico. Marca respaldado=false si una afirmación exagera, infiere causas, compara medidas distintas o usa datos no citados. Sé estricto.",
    messages: [{ role: "user", content: dossier }],
  });
  const evals = toolInput(critique, z.object({ evaluaciones: z.array(z.object({ id: z.string(), respaldado: z.boolean(), comentario: z.string() })) }))?.evaluaciones ?? [];

  const accepted: ValidatedInsight[] = [];
  for (const i of passed) {
    const e = evals.find((x) => x.id === i.id);
    if (e?.respaldado) accepted.push({ ...i, critic: e.comentario });
    else rejected.push({ title: i.title, reason: e ? `Revisor: ${e.comentario}` : "El revisor no lo evaluó" });
  }
  return { accepted, rejected };
}

/** Questions answered in the snapshot. Kept short and concrete so answers stay grounded. */
export const SNAPSHOT_QUESTIONS = [
  "¿Cuánto gasta el Estado por persona al día?",
  "¿Qué ministerios suben más en el Presupuesto 2027?",
  "¿Qué ministerios bajan en el Presupuesto 2027?",
  "¿Cuánto recibe Salud y cuánto sube?",
  "¿Cuánta deuda pide autorizar el Gobierno para 2027?",
  "¿Cuál es la meta fiscal para 2027?",
  "¿Cuándo vence el plazo para aprobar el presupuesto?",
  "¿Cuánto pesan Educación, Salud y Trabajo en el gasto?",
];
