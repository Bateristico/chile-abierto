import { NextResponse } from "next/server";
import { loadFacts } from "@/lib/facts";

/** Open data: every displayable fact with its sources and checks. Pendiente facts are excluded; ejemplo are flagged. */
export function GET() {
  const facts = loadFacts().filter((f) => f.status !== "pendiente");
  return NextResponse.json(
    { generatedAt: new Date().toISOString(), count: facts.length, facts },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
