import type { Metadata } from "next";
import { Header, Footer } from "@/components/Header";
import { BudgetExplorer, type PartidaView } from "@/components/BudgetExplorer";
import { getFact } from "@/lib/facts";
import { partidas } from "@/lib/findings/rules";
import { toProv } from "@/lib/provenance/view";
import { BudgetVoteGrid } from "@/components/BudgetVoteGrid";
import { congresoData } from "@/lib/congreso/load";

export const metadata: Metadata = { title: "Presupuesto 2027" };

export default function Presupuesto() {
  const views: PartidaView[] = partidas()
    .filter((x) => x.amount.status !== "pendiente" && x.variation.status !== "pendiente")
    .map((x) => ({
      slug: x.slug,
      name: x.name,
      short: x.short,
      miles: x.amount.value as number,
      varPct: x.variation.value as number,
      amountProv: toProv(x.amount),
      varProv: toProv(x.variation),
    }));
  const total = getFact("ppto2027.partidas_total");
  const pop = getFact("poblacion.2026");
  return (
    <>
      <Header current="/presupuesto" />
      <BudgetExplorer partidas={views} totalMiles={total.value as number} population={pop.value as number} />
      <div className="wrap" style={{ paddingTop: 0 }} id="votacion">
        {congresoData() && <BudgetVoteGrid data={congresoData()!} />}
        <Footer />
      </div>
    </>
  );
}
