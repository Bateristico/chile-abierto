import type { Metadata } from "next";
import { Header, Footer } from "@/components/Header";
import { FindingsExplorer } from "@/components/FindingsExplorer";
import { AskPanel } from "@/components/AskPanel";
import { Prov } from "@/components/Prov";
import { allFindings } from "@/lib/findings/rules";
import { getFact, loadFacts } from "@/lib/facts";
import { toProv, type ProvInfo } from "@/lib/provenance/view";
import { fmtFact } from "@/lib/format";

export const metadata: Metadata = { title: "Hallazgos" };

export default async function Hallazgos({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  const { f, q } = await searchParams;
  const findings = allFindings();
  const provs: Record<string, ProvInfo> = {};
  for (const fact of loadFacts()) provs[fact.id] = toProv(fact);
  const ctx = ["gc.gasto_total_2027", "gc.crecimiento_real_2027", "gc.meta_deficit_estructural_2027", "deuda.autorizacion_2027"].map(getFact);
  return (
    <>
      <Header current="/hallazgos" />
      <main className="wrap">
        <AskPanel enabled={!!process.env.ANTHROPIC_API_KEY} initial={q} />
        <section className="ctx" aria-label="Contexto de hoy">
          {ctx.map((c) => (
            <div key={c.id}>
              <span className="small muted">{c.label}</span>
              <span className="bignum" style={{ fontSize: 26 }}>{fmtFact(c)}</span>
              <span><Prov info={toProv(c)} /></span>
            </div>
          ))}
        </section>
        <FindingsExplorer findings={findings} provs={provs} initial={f} />
        <Footer />
      </main>
    </>
  );
}
