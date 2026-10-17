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
export async function fetchSnapshot(url: string, publisherId: string, init: RequestInit = {}, retries = 3, keepRaw = true): Promise<Snapshot> {
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
      if (keepRaw && !fs.existsSync(file)) fs.writeFileSync(file, body);
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

const CACHE = path.join(process.cwd(), "data", "cache");

/**
 * fetchSnapshot for documents that never change once published (e.g. a past roll-call vote). The first download is
 * kept gzip-compressed under data/cache with its original retrieval time and sha256, and reused on later runs
 * (the workflow persists data/cache between runs). Provenance stays the original download.
 */
export async function fetchImmutable(url: string, publisherId: string, version = ""): Promise<Snapshot> {
  const { gzipSync, gunzipSync } = await import("node:zlib");
  // `version` lets a document that grows (a bill's vote list) be re-downloaded when something new is known about it.
  const key = sha256(Buffer.from(version ? `${url}#${version}` : url));
  const dir = path.join(CACHE, publisherId);
  const meta = path.join(dir, `${key}.json`);
  const blob = path.join(dir, `${key}.gz`);
  if (fs.existsSync(meta) && fs.existsSync(blob)) {
    const m = JSON.parse(fs.readFileSync(meta, "utf8")) as Omit<Snapshot, "body" | "file">;
    const body = gunzipSync(fs.readFileSync(blob));
    if (sha256(body) === m.sha256) return { ...m, body, file: blob };
  }
  const snap = await fetchSnapshot(url, publisherId, {}, 3, false);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(blob, gzipSync(snap.body));
  fs.writeFileSync(meta, JSON.stringify({ url: snap.url, publisher: snap.publisher, retrievedAt: snap.retrievedAt, sha256: snap.sha256, contentType: snap.contentType }));
  return { ...snap, file: blob };
}

/** Run async work over items with a small fixed concurrency, to be polite with public services. */
export async function pool<T, R>(items: T[], size: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}
