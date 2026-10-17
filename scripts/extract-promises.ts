/**
 * npm run extract-promises -- --url <pdf> --publisher servel --author "Nombre Apellido" --slug nombre-apellido
 *
 * Downloads a campaign program, asks Claude to list atomic, testable promises with an exact quote and page,
 * and keeps only those whose quote is found verbatim in the PDF. Everything else goes to a review queue.
 * Output: data/store/promises/<slug>.json → { accepted, rejected, source }. Editors still review accepted items
 * before they are linked to votes; this step only guarantees the promise was really written.
 */
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { fetchSnapshot } from "../lib/connectors/http";
import { pdfPages } from "../lib/connectors/pdf";
import { checkQuote, ExtractedPromise, TOPICS } from "../lib/promises/validate";

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const url = arg("url");
const publisher = arg("publisher") ?? "servel";
const author = arg("author");
const slug = arg("slug");
if (!url || !author || !slug) {
  console.error('Uso: npm run extract-promises -- --url <pdf> --publisher servel --author "Nombre" --slug nombre');
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Falta ANTHROPIC_API_KEY.");
  process.exit(1);
}

const client = new Anthropic();
const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";
const snap = await fetchSnapshot(url, publisher);
const pages = await pdfPages(new Uint8Array(snap.body));
console.log(`${pages.length} páginas · sha256 ${snap.sha256}`);

const tool = {
  name: "registrar_promesas",
  description: "Registra las promesas verificables encontradas en estas páginas.",
  input_schema: {
    type: "object" as const,
    properties: {
      promesas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            quote: { type: "string", description: "Cita TEXTUAL del documento, copiada carácter por carácter, de una o dos oraciones." },
            page: { type: "integer", description: "Número de página donde está la cita." },
            topic: { type: "string", enum: [...TOPICS] },
            type: { type: "string", enum: ["legislar", "financiar", "votar", "accion-ejecutiva", "otro"] },
            target: { type: "string", description: "Meta medible si la hay (cantidad, plazo, porcentaje)." },
          },
          required: ["quote", "page", "topic", "type"],
        },
      },
    },
    required: ["promesas"],
  },
};

const accepted: (ExtractedPromise & { id: string })[] = [];
const rejected: { promise: unknown; reason: string }[] = [];
const CHUNK = 6;
for (let i = 0; i < pages.length; i += CHUNK) {
  const chunk = pages.slice(i, i + CHUNK);
  const body = chunk.map((p) => `<pagina numero="${p.num}">\n${p.text}\n</pagina>`).join("\n");
  const msg = await client.messages.create({
    model,
    max_tokens: 4000,
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
    system:
      "Extraes promesas de programas de campaña chilenos. Solo promesas concretas y verificables (qué se hará, idealmente con meta o plazo), no diagnósticos ni valores generales. La cita debe ser copia exacta del texto; no la parafrasees ni la corrijas. Si no hay promesas, devuelve una lista vacía.",
    messages: [{ role: "user", content: `Documento de ${author}. Páginas ${chunk[0].num}–${chunk.at(-1)!.num}:\n\n${body}` }],
  });
  const block = msg.content.find((b) => b.type === "tool_use");
  const raw = z.object({ promesas: z.array(z.unknown()) }).safeParse(block && "input" in block ? block.input : {});
  for (const candidate of raw.success ? raw.data.promesas : []) {
    const parsed = ExtractedPromise.safeParse(candidate);
    if (!parsed.success) {
      rejected.push({ promise: candidate, reason: "Formato inválido" });
      continue;
    }
    const check = checkQuote(parsed.data, pages);
    if (!check.ok) rejected.push({ promise: parsed.data, reason: check.reason! });
    else accepted.push({ ...parsed.data, page: check.foundOnPage!, id: `${slug}-${accepted.length + 1}` });
  }
  process.stdout.write(`páginas ${chunk[0].num}–${chunk.at(-1)!.num}: ${accepted.length} aceptadas, ${rejected.length} rechazadas\n`);
}

const out = path.join(process.cwd(), "data", "store", "promises", `${slug}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(
  out,
  JSON.stringify({ author, source: { publisher, url: snap.url, sha256: snap.sha256, retrievedAt: snap.retrievedAt }, accepted, rejected }, null, 2) + "\n",
);
console.log(`Listo: ${accepted.length} promesas con cita verificada; ${rejected.length} a revisión → ${path.relative(process.cwd(), out)}`);
