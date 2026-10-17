import type { Fact, Status } from "./types";
import { getPublisher } from "./sources";
import { fmtFact, fmtDate } from "../format";

/** Serializable provenance summary for the UI (server → client components). */
export interface ProvInfo {
  id: string;
  status: Status;
  label: string;
  value: string;
  definition: string;
  reason: string;
  method?: string;
  sources: { name: string; title: string; url: string; locator?: string; retrieved: string; how: string; sha256?: string; official: boolean }[];
  checks: { description: string; passed: boolean; detail?: string }[];
}

export function toProv(f: Fact): ProvInfo {
  return {
    id: f.id,
    status: f.status,
    label: f.label,
    value: fmtFact(f),
    definition: f.definition,
    reason: f.statusReason,
    method: f.method,
    sources: f.sources.map((s) => {
      const pub = getPublisher(s.publisher);
      return {
        name: pub?.name ?? s.publisher,
        title: s.title,
        url: s.url,
        locator: s.locator,
        retrieved: fmtDate(s.retrievedAt),
        how: s.verifiedBy === "pipeline" ? "descargado y comprobado automáticamente" : "revisado por una persona",
        sha256: s.sha256,
        official: pub?.kind === "oficial",
      };
    }),
    checks: f.checks.map((c) => ({ description: c.description, passed: c.passed, detail: c.detail })),
  };
}
