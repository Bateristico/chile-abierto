import fs from "node:fs";
import path from "node:path";
import { verifyFacts, type ExtraCheck } from "./provenance/verify";
import type { CheckResult, Fact, FactInput } from "./provenance/types";
import { partidaFacts, PartidasDataset } from "./budget/partidas";

const DATA = path.join(process.cwd(), "data");

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

/** Facts written by `npm run ingest` (connectors with snapshots). They replace seed facts with the same id. */
function storeFacts(): FactInput[] {
  const dir = path.join(DATA, "store");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".facts.json"))
    .flatMap((f) => readJson<FactInput[]>(path.join(dir, f)));
}

const DAYS = 365;

/** Facts computed from other facts. Their checks recompute the value so a stale seed can't drift. */
function derived(base: Map<string, FactInput>): { facts: FactInput[]; extra: Record<string, ExtraCheck[]> } {
  const num = (id: string) => {
    const f = base.get(id);
    if (!f || typeof f.value !== "number") throw new Error(`Falta el dato numérico ${id}`);
    return f.value;
  };
  const facts: FactInput[] = [];
  const extra: Record<string, ExtraCheck[]> = {};
  const add = (f: Omit<FactInput, "sources" | "domain" | "asOf" | "value"> & { domain?: FactInput["domain"]; asOf?: string }, compute: () => number) => {
    const value = compute();
    facts.push({ domain: "presupuesto", asOf: "2026-09-30", sources: [], ...f, value });
    extra[f.id] = [
      (fact): CheckResult => ({ id: "recompute", description: "El cálculo se rehízo y da el mismo resultado", passed: fact.value === compute(), detail: f.method }),
    ];
  };

  add(
    {
      id: "gc.por_persona_dia",
      label: "Gasto del Gobierno Central por persona al día",
      definition: "Gasto total del Gobierno Central 2027 dividido por la población proyectada 2026 y por 365 días, en pesos.",
      unit: "CLP",
      derivedFrom: ["gc.gasto_total_2027", "poblacion.2026"],
      method: "gasto total × 1.000.000 ÷ población ÷ 365",
    },
    () => (num("gc.gasto_total_2027") * 1e6) / num("poblacion.2026") / DAYS,
  );
  add(
    {
      id: "deuda.limite_vigente_2026",
      label: "Límite de endeudamiento 2026 tras la ampliación",
      definition: "Límite inicial de la Ley 2026 más la ampliación aprobada a mitad de año.",
      unit: "USD_millones",
      derivedFrom: ["deuda.limite_inicial_2026", "deuda.ampliacion_2026"],
      method: "límite inicial + ampliación",
    },
    () => num("deuda.limite_inicial_2026") + num("deuda.ampliacion_2026"),
  );
  add(
    {
      id: "deuda.alza_vs_inicial",
      label: "Alza del techo de deuda 2027 vs límite inicial 2026",
      definition: "Variación porcentual entre la autorización pedida para 2027 y el límite inicial de 2026 (nominal, en dólares).",
      unit: "pct",
      derivedFrom: ["deuda.autorizacion_2027", "deuda.limite_inicial_2026"],
      method: "(2027 ÷ inicial 2026 − 1) × 100",
    },
    () => (num("deuda.autorizacion_2027") / num("deuda.limite_inicial_2026") - 1) * 100,
  );
  add(
    {
      id: "deuda.alza_vs_vigente",
      label: "Alza del techo de deuda 2027 vs límite ampliado 2026",
      definition: "Variación porcentual entre la autorización pedida para 2027 y el límite 2026 ya ampliado (nominal, en dólares).",
      unit: "pct",
      derivedFrom: ["deuda.autorizacion_2027", "deuda.limite_inicial_2026", "deuda.ampliacion_2026"],
      method: "(2027 ÷ (inicial + ampliación) − 1) × 100",
    },
    () => (num("deuda.autorizacion_2027") / (num("deuda.limite_inicial_2026") + num("deuda.ampliacion_2026")) - 1) * 100,
  );
  return { facts, extra };
}

function dateChecks(base: Map<string, FactInput>): Record<string, ExtraCheck[]> {
  return {
    "tramite.plazo_fecha": [
      (fact): CheckResult => {
        const start = Date.parse(String(base.get("tramite.presentacion")?.value));
        const days = Number(base.get("tramite.plazo_dias")?.value);
        const expected = new Date(start + days * 86_400_000).toISOString().slice(0, 10);
        return { id: "recompute", description: "Presentación + plazo da la fecha publicada", passed: expected === fact.value, detail: `${expected}` };
      },
    ],
  };
}

let cache: Fact[] | null = null;

export function loadFacts(opts: { fresh?: boolean } = {}): Fact[] {
  if (cache && !opts.fresh) return cache;
  const seed = readJson<FactInput[]>(path.join(DATA, "seed", "facts.json"));
  const partidas = partidaFacts(readJson<PartidasDataset>(path.join(DATA, "seed", "budget-2027-partidas.json")));
  const byId = new Map<string, FactInput>();
  for (const f of [...seed, ...partidas.facts]) byId.set(f.id, f);
  // Ingested facts replace seed facts: they come with snapshots from the official publisher.
  for (const f of storeFacts()) byId.set(f.id, f);
  const der = derived(byId);
  for (const f of der.facts) byId.set(f.id, f);
  const extra = { ...partidas.extra, ...der.extra, ...dateChecks(byId) };
  cache = verifyFacts([...byId.values()], extra);
  return cache;
}

export function getFact(id: string): Fact {
  const f = loadFacts().find((x) => x.id === id);
  if (!f) throw new Error(`Fact no encontrado: ${id}`);
  return f;
}

/** Like getFact, but for data that only exists once a connector has run (e.g. Cámara composition). */
export function maybeFact(id: string): Fact | undefined {
  const f = loadFacts().find((x) => x.id === id);
  return f && f.status !== "pendiente" ? f : undefined;
}

export function factsByPrefix(prefix: string): Fact[] {
  return loadFacts().filter((f) => f.id.startsWith(prefix));
}

export function dataMode(): "demo" | "live" {
  return process.env.DATA_MODE === "live" ? "live" : "demo";
}

export interface SnapshotInfo {
  takenAt: string;
  ok: number;
  total: number;
  connectors: { id: string; status: "ok" | "issues" | "error" | "skipped"; detail: string }[];
}

/** Metadata written by `npm run ingest`: when the data snapshot was taken and how each official connector did. */
export function snapshotInfo(): SnapshotInfo | null {
  const p = path.join(DATA, "store", "snapshot.json");
  return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, "utf8")) as SnapshotInfo) : null;
}
