import { z } from "zod";

export const TOPICS = ["seguridad", "pensiones", "salud", "educacion", "vivienda", "medio-ambiente", "economia", "trabajo", "migracion", "institucional", "otro"] as const;

export const ExtractedPromise = z.object({
  quote: z.string().min(20),
  page: z.number().int().positive(),
  topic: z.enum(TOPICS),
  type: z.enum(["legislar", "financiar", "votar", "accion-ejecutiva", "otro"]),
  target: z.string().optional(),
});
export type ExtractedPromise = z.infer<typeof ExtractedPromise>;

/** Normalise for verbatim comparison: case, whitespace, typographic quotes/dashes, hyphenated line breaks. */
export function normaliseForQuote(s: string): string {
  return s
    .replace(/-\s*\n\s*/g, "")
    .replace(/[“”«»"]/g, '"')
    .replace(/[‘’']/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export interface QuoteCheck {
  ok: boolean;
  reason?: string;
  foundOnPage?: number;
}

/**
 * The anti-hallucination rule for promises: a promise is accepted only if its quote appears verbatim
 * (after normalisation) on the page the model cited. If it appears on another page we record the real page;
 * if it appears nowhere, the promise is rejected and goes to the review queue.
 */
export function checkQuote(p: ExtractedPromise, pages: { num: number; text: string }[]): QuoteCheck {
  const q = normaliseForQuote(p.quote);
  if (q.split(" ").length < 4) return { ok: false, reason: "Cita demasiado corta para verificar" };
  const cited = pages.find((x) => x.num === p.page);
  if (cited && normaliseForQuote(cited.text).includes(q)) return { ok: true, foundOnPage: p.page };
  const elsewhere = pages.find((x) => normaliseForQuote(x.text).includes(q));
  if (elsewhere) return { ok: true, foundOnPage: elsewhere.num, reason: `La cita está en la página ${elsewhere.num}, no en la ${p.page}` };
  return { ok: false, reason: "La cita no aparece textual en el documento" };
}
