"use client";

import Link from "next/link";
import { useState } from "react";
import { fmtBillones, fmtClp, fmtPct, fmtNumber } from "@/lib/format";

export interface ShareItem {
  key: string;
  name: string;
  miles: number;
  varPct: number | null;
  color: string;
  ink: string;
  href: string;
}

type Unit = "cien" | "billones" | "dia";

/** «Where each $100 goes»: one stacked bar, three readings of the same numbers. */
export function ShareBar({ items, totalMiles, population }: { items: ShareItem[]; totalMiles: number; population: number }) {
  const [unit, setUnit] = useState<Unit>("cien");
  const show = (miles: number) => {
    if (unit === "billones") return fmtBillones(miles).replace(" billones", " bill.").replace(" mil millones", " mil mill.");
    if (unit === "dia") return fmtClp((miles * 1000) / population / 365);
    return `$${fmtNumber((miles / totalMiles) * 100, 1)}`;
  };
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="kicker">Presupuesto 2027 · 32 partidas</span>
          <h2 className="sec-title">
            {unit === "cien" ? "De cada $100, ¿dónde van?" : unit === "billones" ? `${fmtBillones(totalMiles)}, partida por partida` : "Lo que cada persona financia al día"}
          </h2>
        </div>
        <div className="seg" role="group" aria-label="Mostrar en">
          {(
            [
              ["cien", "De cada $100"],
              ["billones", "Billones"],
              ["dia", "Por persona"],
            ] as [Unit, string][]
          ).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={unit === k} onClick={() => setUnit(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="sharebar" aria-hidden="true">
        {items.map((it, i) => (
          <span key={it.key} className={`growY d${i + 1}${it.miles / totalMiles < 0.1 ? " minor" : ""}`} style={{ flex: it.miles, background: it.color, color: it.ink }}>
            {it.miles / totalMiles > 0.05 && <span className="pct">{show(it.miles)}</span>}
          </span>
        ))}
      </div>
      <div className="legend">
        {items.map((it) => (
          <Link key={it.key} href={it.href}>
            <span className="sw" style={{ background: it.color }} />
            <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span style={{ fontWeight: 600 }}>{it.name}</span>
              <span className="tiny muted">
                {show(it.miles)}
                {unit === "cien" ? " de cada $100" : ""}
                {it.varPct !== null ? ` · ${fmtPct(it.varPct, true)} real` : ""}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
