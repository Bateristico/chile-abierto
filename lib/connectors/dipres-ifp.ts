import fs from "node:fs";
import path from "node:path";
import { fetchSnapshot } from "./http";
import { normaliseText, pdfPages, type PdfPage } from "./pdf";
import type { Connector, ConnectorResult } from "./types";
import type { FactInput, SourceRef } from "../provenance/types";
import { PartidasDataset } from "../budget/partidas";

const IFP_URL = "https://www.dipres.gob.cl/597/articles-433297_doc_pdf.pdf";

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find a partida row in the IFP: its name followed by the 2027 amount (miles de $, dot thousands) and a real % change.
 * Returns every candidate so the caller can refuse ambiguous matches.
 */
export function findPartidaRow(pages: PdfPage[], name: string): { page: number; milesCLP: number; varPct: number }[] {
  const re = new RegExp(`${escapeRe(normaliseText(name))}\\s+(\\d{1,3}(?:\\.\\d{3})+)\\s+(-?\\d+,\\d)`, "g");
  const hits: { page: number; milesCLP: number; varPct: number }[] = [];
  for (const p of pages) {
    const text = normaliseText(p.text);
    for (const m of text.matchAll(re)) {
      hits.push({ page: p.num, milesCLP: Number(m[1].replace(/\./g, "")), varPct: Number(m[2].replace(",", ".")) });
    }
  }
  return hits;
}

export function findGcTotal(pages: PdfPage[]): { page: number; millones: number } | null {
  for (const p of pages) {
    const m = normaliseText(p.text).match(/gasto del Gobierno Central total de \$\s?(\d{1,3}(?:\.\d{3})+) millones/i);
    if (m) return { page: p.num, millones: Number(m[1].replace(/\./g, "")) };
  }
  return null;
}

/**
 * Reads the DIPRES Informe de Finanzas Públicas and re-derives the 2027 figures from the official PDF itself.
 * Each partida found and equal to the corroborated value is re-published with DIPRES as an official source
 * (with page locator and snapshot hash), which upgrades it to «oficial». A mismatch is an issue for human review:
 * nothing is published for that partida.
 */
export const dipresIfp: Connector = {
  id: "dipres-ifp",
  description: "DIPRES · Informe de Finanzas Públicas 3T 2026: gasto 2027 por partida y total del Gobierno Central",
  async run(): Promise<ConnectorResult> {
    const snap = await fetchSnapshot(IFP_URL, "dipres");
    const pages = await pdfPages(new Uint8Array(snap.body));
    const seed = PartidasDataset.parse(
      JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "seed", "budget-2027-partidas.json"), "utf8")),
    );
    const facts: FactInput[] = [];
    const issues: string[] = [];
    const notes: string[] = [`${pages.length} páginas leídas, sha256 ${snap.sha256}`];

    const official = (locator: string, asPrinted: string, reportedValue: number): SourceRef => ({
      publisher: "dipres",
      title: "Informe de Finanzas Públicas, tercer trimestre 2026",
      url: IFP_URL,
      locator,
      retrievedAt: snap.retrievedAt,
      sha256: snap.sha256,
      verifiedBy: "pipeline",
      asPrinted,
      reportedValue,
    });

    for (const row of seed.partidas) {
      const hits = findPartidaRow(pages, row.name);
      const unique = [...new Map(hits.map((h) => [`${h.milesCLP}|${h.varPct}`, h])).values()];
      if (unique.length === 0) {
        notes.push(`No se encontró la fila de «${row.name}»; se mantiene como corroborado.`);
        continue;
      }
      if (unique.length > 1) {
        issues.push(`«${row.name}» aparece con valores distintos en el PDF: ${unique.map((u) => `${u.milesCLP} (p. ${u.page})`).join(", ")}`);
        continue;
      }
      const hit = unique[0];
      if (hit.milesCLP !== row.milesCLP || hit.varPct !== row.varPct) {
        issues.push(`«${row.name}»: el PDF dice ${hit.milesCLP} / ${hit.varPct}% y la prensa ${row.milesCLP} / ${row.varPct}%. Requiere revisión.`);
        continue;
      }
      const press = Object.values(seed.sources);
      facts.push({
        id: `ppto2027.partida.${row.slug}`,
        label: row.name,
        definition: seed.measure,
        value: row.milesCLP,
        unit: "CLP_miles",
        asOf: seed.asOf,
        domain: "presupuesto",
        sources: [official(`Cuadro por partida, página ${hit.page}`, hit.milesCLP.toLocaleString("es-CL"), hit.milesCLP), ...press],
      });
      facts.push({
        id: `ppto2027.var.${row.slug}`,
        label: `Variación real de ${row.name}`,
        definition: seed.comparison,
        value: row.varPct,
        unit: "pct",
        asOf: seed.asOf,
        domain: "presupuesto",
        sources: [official(`Cuadro por partida, página ${hit.page}`, `${hit.varPct}%`, hit.varPct), ...press.map((s) => ({ ...s, reportedValue: row.varPct }))],
      });
    }

    const total = findGcTotal(pages);
    if (!total) notes.push("No se encontró el total del Gobierno Central en el texto.");
    else if (total.millones !== 91175816) issues.push(`El total del Gobierno Central en el PDF (${total.millones}) no coincide con el registrado (91.175.816).`);
    else {
      notes.push(`Total del Gobierno Central confirmado en la página ${total.page}.`);
      facts.push({
        id: "gc.gasto_total_2027",
        label: "Gasto total del Gobierno Central, Proyecto 2027",
        definition: "Gasto total del Gobierno Central (presupuestario y extrapresupuestario) proyectado para 2027 en el Proyecto de Ley de Presupuestos. Equivale al 23,7% del PIB.",
        value: total.millones,
        unit: "CLP_millones",
        asOf: "2026-09-30",
        domain: "presupuesto",
        sources: [official(`Resumen, página ${total.page}`, `$${total.millones.toLocaleString("es-CL")} millones`, total.millones)],
      });
    }

    return { connector: this.id, facts, issues, notes };
  },
};
