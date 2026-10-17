import { NextResponse } from "next/server";
import { z } from "zod";
import { ask } from "@/lib/agents/ask";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ question: z.string().trim().min(3).max(500) });

// Simple per-instance rate limit; put a real limiter (e.g. at the CDN) in front in production.
const hits = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 10;
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "El asistente no está configurado." }, { status: 503 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) return NextResponse.json({ error: "Demasiadas preguntas seguidas. Espera un minuto." }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "La pregunta debe tener entre 3 y 500 caracteres." }, { status: 400 });
  try {
    return NextResponse.json(await ask(parsed.data.question));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "No se pudo responder ahora. Intenta de nuevo." }, { status: 502 });
  }
}
