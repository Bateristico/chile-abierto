import fs from "node:fs";
import path from "node:path";
import { getPublisher } from "../provenance/sources";
import { sha256 } from "../provenance/hash";

export interface Snapshot {
  url: string;
  publisher: string;
  retrievedAt: string;
  sha256: string;
  contentType: string;
  body: Buffer;
  /** Path of the raw copy under data/raw, kept so every published number can be re-derived. */
  file: string;
}

const RAW = path.join(process.cwd(), "data", "raw");

const SECRET_PARAMS = ["ticket", "pass", "password", "user", "token", "apikey", "api_key"];

/** Credentials travel in the query string for some APIs; they must never reach snapshots, manifests or sources. */
export function redactUrl(url: string): string {
  const u = new URL(url);
  for (const k of [...u.searchParams.keys()]) if (SECRET_PARAMS.includes(k.toLowerCase())) u.searchParams.set(k, "REDACTED");
  return u.toString();
}

/**
 * Download a document from an official publisher and keep an immutable raw copy.
 * Refuses URLs outside the publisher's registered domains: ingestion only ever reads from the source of truth.
 */
export async function fetchSnapshot(url: string, publisherId: string, init: RequestInit = {}, retries = 3): Promise<Snapshot> {
  const pub = getPublisher(publisherId);
  if (!pub) throw new Error(`Publicador no registrado: ${publisherId}`);
  if (pub.kind !== "oficial") throw new Error(`La ingesta solo lee fuentes oficiales; ${pub.name} es ${pub.kind}`);
  const host = new URL(url).hostname;
  if (!pub.domains.includes(host)) throw new Error(`${url} no pertenece a ${pub.name} (${pub.domains.join(", ")})`);

  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { "User-Agent": "ChileAbierto/0.1 (+https://github.com/; transparencia ciudadana)", ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
      const body = Buffer.from(await res.arrayBuffer());
      if (body.length === 0) throw new Error(`Respuesta vacía de ${url}`);
      const hash = sha256(body);
      const contentType = res.headers.get("content-type") ?? "application/octet-stream";
      const ext = contentType.includes("pdf") ? "pdf" : contentType.includes("json") ? "json" : contentType.includes("xml") ? "xml" : contentType.includes("csv") ? "csv" : "bin";
      const dir = path.join(RAW, publisherId);
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${hash}.${ext}`);
      if (!fs.existsSync(file)) fs.writeFileSync(file, body);
      const retrievedAt = new Date().toISOString();
      const safeUrl = redactUrl(url);
      fs.appendFileSync(path.join(RAW, "manifest.jsonl"), JSON.stringify({ url: safeUrl, publisher: publisherId, retrievedAt, sha256: hash, bytes: body.length, contentType }) + "\n");
      return { url: safeUrl, publisher: publisherId, retrievedAt, sha256: hash, contentType, body, file };
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw lastErr;
}
