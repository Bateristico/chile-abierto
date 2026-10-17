/**
 * npm run classify-laws
 *
 * AI draft of each law's depth class and impact parts, for the laws the published rules don't decide. Works only from
 * the bill's own record (title, topics, initiative, stage signals); every draft carries its reason and is shown as
 * «borrador IA, pendiente de revisión». Drafts are cached (data/cache) so each law is classified once.
 * Without ANTHROPIC_API_KEY it only applies the rules.
 */
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { ruleFor, type Clasificacion } from "../lib/leyes/clasificacion";
import { GOBIERNO_ACTUAL } from "../lib/leyes/gobiernos";
import { LEYES_DESDE } from "../lib/connectors/leyes";
import type { Bill, LeyesData } from "../lib/leyes/types";

const CACHE = path.join(process.cwd(), "data", "cache", "leyes", "clasificacion.json");
const OUT = path.join(process.cwd(), "data", "store", "leyes-clasificacion.json");
const RECORDS = path.join(process.cwd(), "data", "store", "leyes.records.json");

const PartesSchema = z.object({
  alcance: z.enum(["amplio", "grande", "acotado", "local", "desconocido"]),
  permanencia: z.enum(["permanente", "temporal", "puntual", "desconocido"]),
  derechos: z.enum(["crea", "ajusta", "ninguno", "desconocido"]),
  instituciones: z.enum(["crea", "ajusta", "ninguna", "desconocido"]),
});
const ItemSchema = z.object({
  boletin: z.string(),
  profundidad: z.enum(["simbolica", "ajuste", "sectorial", "estructural"]),
  razon: z.string().min(10).max(320),
  partes: PartesSchema,
});

type Cached = Record<string, Clasificacion & { titulo: string }>;
const readJson = <T>(file: string, fallback: T): T => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
};

if (!fs.existsSync(RECORDS)) {
  console.log("Sin datos de leyes (data/store/leyes.records.json): nada que clasificar.");
  process.exit(0);
}
const data = readJson<{ leyes: LeyesData[] }>(RECORDS, { leyes: [] }).leyes[0];
const bills = data?.bills ?? [];
const inScope = (b: Bill) => (b.st === "ley" && (b.publicada ?? "") >= LEYES_DESDE) || (b.iniciativa === "Mensaje" && b.ingreso >= GOBIERNO_ACTUAL.desde);
const cached = readJson<Cached>(CACHE, {});

const todo = bills.filter((b) => inScope(b) && !ruleFor(b) && !(cached[b.b] && cached[b.b].titulo === b.titulo));
const byRule = bills.filter((b) => inScope(b) && ruleFor(b)).length;
console.log(`Leyes en alcance: ${bills.filter(inScope).length} · por regla: ${byRule} · ya clasificadas: ${bills.filter(inScope).length - byRule - todo.length} · pendientes: ${todo.length}`);

const errors: string[] = [];
if (todo.length && process.env.ANTHROPIC_API_KEY) {
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";
  const client = new Anthropic();
  const TOOL: Anthropic.Tool = {
    name: "clasificar_leyes",
    description: "Clasifica cada proyecto o ley por profundidad e impacto.",
    input_schema: {
      type: "object",
      properties: {
        leyes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              boletin: { type: "string" },
              profundidad: { type: "string", enum: ["simbolica", "ajuste", "sectorial", "estructural"] },
              razon: { type: "string", description: "Una o dos oraciones: en qué parte del registro te basas y por qué esa clase. Sin adjetivos políticos." },
              partes: {
                type: "object",
                properties: {
                  alcance: { type: "string", enum: ["amplio", "grande", "acotado", "local", "desconocido"] },
                  permanencia: { type: "string", enum: ["permanente", "temporal", "puntual", "desconocido"] },
                  derechos: { type: "string", enum: ["crea", "ajusta", "ninguno", "desconocido"] },
                  instituciones: { type: "string", enum: ["crea", "ajusta", "ninguna", "desconocido"] },
                },
                required: ["alcance", "permanencia", "derechos", "instituciones"],
              },
            },
            required: ["boletin", "profundidad", "razon", "partes"],
          },
        },
      },
      required: ["leyes"],
    },
  };
  const SYSTEM = `Clasificas leyes y proyectos chilenos para un sitio ciudadano de rendición de cuentas. Trabajas solo con el registro entregado (título, materias, tipo de iniciativa, señales de tramitación). No uses lo que recuerdes de la ley.
Profundidad:
- simbolica: reconoce o nombra; no cambia derechos, dinero ni instituciones.
- ajuste: corrige, prorroga o actualiza una regla existente; efecto acotado.
- sectorial: cambia cómo funciona un sector (nuevas obligaciones, beneficios o reglas en un área).
- estructural: cambia un sistema completo o el diseño del Estado (nueva institución o sistema, reforma constitucional amplia).
Partes del impacto (usa «desconocido» si el registro no alcanza para decidir):
- alcance: amplio (casi toda la población o todos los trabajadores, contribuyentes, etc.), grande (un grupo numeroso), acotado (una profesión, un sector pequeño), local (un lugar o pocas personas).
- permanencia: permanente, temporal (con plazo), puntual (un acto único).
- derechos: crea (nuevos derechos, beneficios, deberes o sanciones), ajusta, ninguno.
- instituciones: crea (nuevo organismo, facultades o quórum especial), ajusta, ninguna.
Sé neutral: misma vara para cualquier gobierno o partido. Ante la duda, la clase menor.`;
  for (let i = 0; i < todo.length; i += 25) {
    const batch = todo.slice(i, i + 25);
    const lines = batch.map((b) => `- ${b.b} | ${b.titulo} | iniciativa: ${b.iniciativa} | materias: ${b.materias.join(", ") || "—"} | señales: ${b.señales.join(", ") || "ninguna"} | estado: ${b.estado}`).join("\n");
    try {
      const res = await client.messages.create({
        model,
        max_tokens: 8000,
        system: SYSTEM,
        tools: [TOOL],
        tool_choice: { type: "auto" },
        messages: [{ role: "user", content: `Clasifica estos ${batch.length} registros. Responde llamando a la herramienta ${TOOL.name}, con un elemento por boletín.\n${lines}` }],
      });
      const block = res.content.find((c) => c.type === "tool_use");
      const items = z.object({ leyes: z.array(z.unknown()) }).safeParse(block && "input" in block ? block.input : null);
      let ok = 0;
      for (const raw of items.success ? items.data.leyes : []) {
        const p = ItemSchema.safeParse(raw);
        const bill = p.success ? batch.find((b) => b.b === p.data.boletin) : undefined;
        if (!p.success || !bill) continue;
        cached[bill.b] = { titulo: bill.titulo, profundidad: p.data.profundidad, razon: p.data.razon, partes: p.data.partes, por: "ia", modelo: model };
        ok++;
      }
      console.log(`  lote ${i / 25 + 1}: ${ok} de ${batch.length}`);
    } catch (e) {
      const err = e as { status?: number; message?: string };
      errors.push(`${err.status ? `HTTP ${err.status} · ` : ""}${(err.message ?? String(e)).replace(/sk-ant-[\w-]+/g, "[clave]").slice(0, 200)}`);
      if (err.status === 401 || err.status === 400 || err.status === 404) break;
    }
  }
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify(cached));
} else if (todo.length) {
  console.log("Sin ANTHROPIC_API_KEY: las leyes sin regla quedan sin clasificar.");
}

const items: Record<string, Clasificacion> = {};
for (const b of bills) if (cached[b.b] && cached[b.b].titulo === b.titulo) {
  const { titulo: _t, ...c } = cached[b.b];
  items[b.b] = c;
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), items, errors }, null, 1) + "\n");
console.log(`→ ${Object.keys(items).length} borradores IA publicados${errors.length ? ` · errores: ${errors.join(" | ")}` : ""}`);
