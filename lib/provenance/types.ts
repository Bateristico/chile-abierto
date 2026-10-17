import { z } from "zod";

/**
 * Verification levels, strongest first. A number is only ever shown with the level it earned.
 *
 * - oficial:      taken from an official publisher's document/API, located (page/table/endpoint) and every check passed.
 * - corroborado:  reported by ≥2 independent publishers that agree, and every check passed; not yet read from the official document itself.
 * - secundario:   a single non-official publisher, checks passed. Shown, but flagged.
 * - pendiente:    no usable source yet, or a check failed. Never shown as a number in the UI.
 * - ejemplo:      fictional demo fixture. Always labelled; never mixed into totals or findings with real data.
 */
export const STATUS_ORDER = ["oficial", "corroborado", "secundario", "pendiente", "ejemplo"] as const;
export type Status = (typeof STATUS_ORDER)[number];

export const SourceKind = z.enum(["oficial", "prensa", "academico", "ong"]);
export type SourceKind = z.infer<typeof SourceKind>;

export const SourceRef = z.object({
  /** Publisher id from the registry in sources.ts (e.g. "dipres", "emol"). */
  publisher: z.string(),
  title: z.string(),
  url: z.string().url(),
  /** Where in the document the value is: page, table, cuadro, XML path… */
  locator: z.string().optional(),
  publishedAt: z.string().optional(),
  retrievedAt: z.string(),
  /** sha256 of the raw snapshot, set by the ingestion pipeline when it downloads the document. */
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  /** Who confirmed the value against the source: the pipeline (with snapshot) or a person. */
  verifiedBy: z.enum(["pipeline", "manual"]),
  /** Value exactly as this source printed it, before unit normalisation, for audit. */
  asPrinted: z.string().optional(),
  /** The same value converted to the fact's unit. Every source that reports one must match the fact's value. */
  reportedValue: z.union([z.number(), z.string()]).optional(),
});
export type SourceRef = z.infer<typeof SourceRef>;

export const CheckResult = z.object({
  id: z.string(),
  description: z.string(),
  passed: z.boolean(),
  detail: z.string().optional(),
});
export type CheckResult = z.infer<typeof CheckResult>;

export const Unit = z.enum([
  "CLP",
  "CLP_miles",
  "CLP_millones",
  "USD_millones",
  "pct",
  "pct_pib",
  "personas",
  "conteo",
  "dias",
  "fecha",
]);
export type Unit = z.infer<typeof Unit>;

export const FactInput = z.object({
  id: z.string().regex(/^[a-z0-9_.-]+$/),
  label: z.string(),
  /** Plain-language definition of what exactly is measured. Two numbers with different definitions are different facts. */
  definition: z.string(),
  value: z.union([z.number(), z.string()]),
  unit: Unit,
  asOf: z.string(),
  domain: z.enum(["presupuesto", "congreso", "electoral", "integridad", "contexto"]),
  sources: z.array(SourceRef),
  demo: z.boolean().default(false),
  /** Facts computed from other facts list their inputs; their status can never exceed the weakest input. */
  derivedFrom: z.array(z.string()).optional(),
  method: z.string().optional(),
});
export type FactInput = z.input<typeof FactInput>;

export interface Fact extends z.infer<typeof FactInput> {
  status: Status;
  checks: CheckResult[];
  statusReason: string;
}
