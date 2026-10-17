import { FactInput, type CheckResult, type Fact, type Status, STATUS_ORDER } from "./types";
import { getPublisher } from "./sources";
import { parsePrinted } from "./parse";

/** Extra checks a dataset can attach to a fact (reconciliation, ranges, cross-source agreement). */
export type ExtraCheck = (fact: Fact) => CheckResult;

export function weakest(statuses: Status[]): Status {
  let idx = 0;
  for (const s of statuses) idx = Math.max(idx, STATUS_ORDER.indexOf(s));
  return STATUS_ORDER[idx];
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Built-in checks every fact goes through. */
export function baseChecks(fact: FactInput): CheckResult[] {
  const checks: CheckResult[] = [];

  // 1. Every source comes from a registered publisher, served from that publisher's own domain, over HTTPS.
  for (const [i, s] of fact.sources.entries()) {
    const pub = getPublisher(s.publisher);
    const host = hostOf(s.url);
    const okDomain = !!pub && !!host && pub.domains.includes(host);
    checks.push({
      id: `source-${i}-domain`,
      description: `La fuente ${i + 1} viene del dominio de ${pub?.name ?? s.publisher}`,
      passed: okDomain && s.url.startsWith("https://"),
      detail: okDomain ? host! : `Dominio ${host ?? "inválido"} no corresponde al publicador registrado`,
    });
  }

  // 2. Value is well formed for its unit.
  if (typeof fact.value === "number") {
    const finite = Number.isFinite(fact.value);
    const nonNegative = !["CLP", "CLP_miles", "CLP_millones", "USD_millones", "personas", "conteo", "dias"].includes(fact.unit) || fact.value >= 0;
    checks.push({
      id: "value-range",
      description: "El valor es un número válido para su unidad",
      passed: finite && nonNegative,
      detail: finite ? undefined : "Valor no finito",
    });
  } else {
    checks.push({
      id: "value-date",
      description: "La fecha es válida",
      passed: fact.unit !== "fecha" || !Number.isNaN(Date.parse(fact.value)),
    });
  }

  // 3. Every source that reports the value (converted to the fact's unit) reports exactly the published value.
  const reported = fact.sources
    .map((s) => {
      if (s.reportedValue !== undefined) return { ...s, reportedValue: s.reportedValue };
      if (s.asPrinted && typeof fact.value === "number") {
        const parsed = parsePrinted(s.asPrinted, fact.unit);
        // Signed percentages are often printed without sign ("déficit de 2,8%"); compare magnitudes for pct units.
        if (parsed !== null) return { ...s, reportedValue: fact.unit.startsWith("pct") && Math.sign(parsed) !== Math.sign(fact.value) ? -parsed : parsed };
      }
      return null;
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);
  if (reported.length > 0) {
    const mismatches = reported.filter((s) => !sameValue(s.reportedValue, fact.value));
    checks.push({
      id: "sources-agree",
      description: reported.length > 1 ? "Todas las fuentes reportan el mismo valor" : "La fuente reporta el valor publicado",
      passed: mismatches.length === 0,
      detail: mismatches.length
        ? `No coincide: ${mismatches.map((s) => `${s.publisher} = ${s.asPrinted ?? s.reportedValue}`).join(", ")}`
        : reported.map((s) => `${s.publisher}: «${s.asPrinted ?? s.reportedValue}»`).join(" · "),
    });
  }

  // 4. Not stale: the as-of date is not in the future relative to retrieval.
  const asOf = Date.parse(fact.asOf);
  const retrieved = Math.max(...fact.sources.map((s) => Date.parse(s.retrievedAt)).filter(Number.isFinite), 0);
  if (Number.isFinite(asOf) && retrieved > 0) {
    checks.push({
      id: "as-of",
      description: "La fecha del dato es anterior a su obtención",
      passed: asOf <= retrieved + 86_400_000,
    });
  }
  return checks;
}

export function sameValue(a: number | string, b: number | string): boolean {
  if (typeof a === "number" && typeof b === "number") {
    if (a === b) return true;
    return Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * 1e-9;
  }
  return String(a) === String(b);
}

/** Independent = different publishers that do not share an owner group. */
export function independentPublishers(fact: FactInput): string[] {
  const groups = new Set<string>();
  for (const s of fact.sources) {
    const pub = getPublisher(s.publisher);
    groups.add(pub?.group ?? pub?.id ?? s.publisher);
  }
  return [...groups];
}

export function deriveStatus(fact: FactInput, checks: CheckResult[], inputs: Fact[] = []): { status: Status; reason: string } {
  if (fact.demo) return { status: "ejemplo", reason: "Dato ficticio de demostración." };
  const failed = checks.filter((c) => !c.passed);
  if (failed.length > 0) return { status: "pendiente", reason: `Falló una verificación: ${failed[0].description}.` };
  if (fact.sources.length === 0 && !fact.derivedFrom?.length) return { status: "pendiente", reason: "Sin fuente." };

  let own: Status;
  let reason: string;
  const official = fact.sources.filter((s) => getPublisher(s.publisher)?.kind === "oficial" && s.locator);
  if (official.length > 0) {
    own = "oficial";
    const s = official[0];
    reason = `Leído en ${getPublisher(s.publisher)!.name} (${s.locator})${s.sha256 ? ", con copia verificada" : ", verificado manualmente"}.`;
  } else if (independentPublishers(fact).length >= 2) {
    own = "corroborado";
    reason = `Coinciden ${independentPublishers(fact).length} medios independientes; falta leerlo en el documento oficial.`;
  } else if (fact.sources.length === 1) {
    own = "secundario";
    reason = "Una sola fuente no oficial.";
  } else if (fact.derivedFrom?.length) {
    own = "oficial";
    reason = "Calculado a partir de otros datos.";
  } else {
    own = "secundario";
    reason = "Fuentes no independientes entre sí.";
  }

  if (inputs.length) {
    const status = weakest([own, ...inputs.map((i) => i.status)]);
    if (status !== own) reason += ` Hereda el nivel «${status}» de su dato más débil.`;
    return { status, reason };
  }
  return { status: own, reason };
}

/**
 * Validate and grade a list of facts. Derived facts are graded after their inputs.
 * Throws on schema errors: malformed provenance is a bug, not a data state.
 */
export function verifyFacts(inputs: FactInput[], extra: Record<string, ExtraCheck[]> = {}): Fact[] {
  const parsed = inputs.map((f) => FactInput.parse(f));
  const ids = new Set<string>();
  for (const f of parsed) {
    if (ids.has(f.id)) throw new Error(`Fact id duplicado: ${f.id}`);
    ids.add(f.id);
  }
  const byId = new Map<string, Fact>();
  const pending = [...parsed];
  let guard = 0;
  while (pending.length && guard++ < 1000) {
    const f = pending.shift()!;
    const deps = f.derivedFrom ?? [];
    const missing = deps.filter((d) => !ids.has(d));
    if (missing.length) throw new Error(`${f.id} depende de facts inexistentes: ${missing.join(", ")}`);
    if (deps.some((d) => !byId.has(d))) {
      pending.push(f);
      continue;
    }
    const depFacts = deps.map((d) => byId.get(d)!);
    const provisional: Fact = { ...f, status: "pendiente", checks: [], statusReason: "" };
    const checks = [...baseChecks(f), ...(extra[f.id] ?? []).map((c) => c(provisional))];
    const { status, reason } = deriveStatus(f, checks, depFacts);
    byId.set(f.id, { ...f, checks, status, statusReason: reason });
  }
  if (pending.length) throw new Error("Dependencias circulares entre facts");
  return parsed.map((f) => byId.get(f.id)!);
}

export function isDisplayable(status: Status): boolean {
  return status !== "pendiente";
}
