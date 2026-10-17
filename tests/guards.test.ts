import { describe, expect, it } from "vitest";
import { checkGrounding, numbersIn } from "@/lib/agents/grounding";
import { checkQuote } from "@/lib/promises/validate";
import { squarify } from "@/lib/budget/treemap";
import { reconcileVotes, parseXml, findArray, parseOpcion, parseDeputies, voteDeputyId } from "@/lib/connectors/camara";
import { redactUrl } from "@/lib/connectors/http";
import { findPartidaRow } from "@/lib/connectors/dipres-ifp";
import { pickCpiSeries } from "@/lib/connectors/bcch";
import { partyAt, majority, loadFichaConfigs } from "@/lib/connectors/fichas";
import { loadFacts } from "@/lib/facts";

describe("agent grounding", () => {
  const facts = loadFacts();
  const retrieved = facts.filter((f) => ["gc.gasto_total_2027", "ppto2027.var.salud", "ppto2027.partida.salud"].includes(f.id));

  it("parses Spanish numbers and ignores years and citations", () => {
    expect(numbersIn("En 2027 el gasto es $91.175.816 millones [gc.gasto_total_2027] y sube 1,5%")).toEqual([91175816, 1.5]);
  });

  it("accepts numbers that come from retrieved facts, in any reasonable unit or rounding", () => {
    const ok = "El Gobierno Central gastará $91,2 billones [gc.gasto_total_2027]. Salud recibe $18,3 billones, un alza real de 4,7% [ppto2027.var.salud].";
    expect(checkGrounding(ok, retrieved).grounded).toBe(true);
  });

  it("flags an invented number", () => {
    const bad = "Salud sube 12,4% [ppto2027.var.salud].";
    const g = checkGrounding(bad, retrieved);
    expect(g.grounded).toBe(false);
    expect(g.unsupported).toContain(12.4);
  });
});

describe("promise quotes", () => {
  const pages = [
    { num: 1, text: "Introducción al programa." },
    { num: 12, text: "Seguridad. Vamos a contratar 5.000 nuevos\ncarabineros durante el primer año de gobierno." },
  ];
  it("accepts a verbatim quote even across line breaks", () => {
    expect(checkQuote({ quote: "Vamos a contratar 5.000 nuevos carabineros durante el primer año", page: 12, topic: "seguridad", type: "financiar" }, pages).ok).toBe(true);
  });
  it("corrects the page when the quote is elsewhere", () => {
    const r = checkQuote({ quote: "Vamos a contratar 5.000 nuevos carabineros", page: 3, topic: "seguridad", type: "financiar" }, pages);
    expect(r.ok).toBe(true);
    expect(r.foundOnPage).toBe(12);
  });
  it("rejects a paraphrase", () => {
    expect(checkQuote({ quote: "Contrataremos cinco mil carabineros nuevos el primer año", page: 12, topic: "seguridad", type: "financiar" }, pages).ok).toBe(false);
  });
});

describe("connectors", () => {
  it("never stores credentials from query strings", () => {
    expect(redactUrl("https://api.mercadopublico.cl/x.json?fecha=01102026&ticket=ABC-123")).not.toContain("ABC-123");
    expect(redactUrl("https://si3.bcentral.cl/S.ashx?user=me&pass=secret&function=GetSeries")).not.toMatch(/secret|=me&/);
    expect(redactUrl("https://si3.bcentral.cl/S.ashx?token=tok-999&function=GetSeries")).not.toContain("tok-999");
  });

  it("picks the general CPI index with the latest base from the BDE catalogue", () => {
    const pick = pickCpiSeries([
      { seriesId: "F073.TCO.PRE.Z.D", spanishTitle: "Dólar observado" },
      { seriesId: "F074.IPC.IND.Z.EP18.C.M", spanishTitle: "IPC General, índice base 2018=100" },
      { seriesId: "F074.IPC.IND.Z.EP23.C.M", spanishTitle: "IPC General, índice base 2023=100" },
      { seriesId: "F074.IPC.VAR.Z.Z.C.M", spanishTitle: "IPC General, variación mensual" },
      { seriesId: "F074.IPC.IND.Z.EP23.ALI.M", spanishTitle: "IPC Alimentos" },
    ]);
    expect(pick.chosen).toBe("F074.IPC.IND.Z.EP23.C.M");
    expect(pick.candidates).toHaveLength(2);
  });

  it("reconciles individual votes with the published totals, by official option code", () => {
    // Shape and codes as returned by retornarVotacionDetalle on 17 Oct 2026 (votación 90328).
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<Votacion xmlns="http://opendata.camara.cl/camaradiputados/v1"><Id>90328</Id><Fecha>2026-10-07T13:18:43</Fecha>
<TotalSi>2</TotalSi><TotalNo>1</TotalNo><TotalAbstencion>1</TotalAbstencion><TotalDispensado>0</TotalDispensado>
<Votos>
<Voto><Diputado><Id>803</Id><Nombre>René</Nombre></Diputado><OpcionVoto Valor="0">En Contra</OpcionVoto></Voto>
<Voto><Diputado><Id>815</Id><Nombre>Sergio</Nombre></Diputado><OpcionVoto Valor="1">Afirmativo</OpcionVoto></Voto>
<Voto><Diputado><Id>843</Id><Nombre>René Manuel</Nombre></Diputado><OpcionVoto Valor="1">Afirmativo</OpcionVoto></Voto>
<Voto><Diputado><Id>872</Id><Nombre>Jaime</Nombre></Diputado><OpcionVoto Valor="2">Abstención</OpcionVoto></Voto>
<Voto><Diputado><Id>900</Id><Nombre>X</Nombre></Diputado><OpcionVoto Valor="4">No Vota</OpcionVoto></Voto>
</Votos></Votacion>`;
    const v = { Id: 90328, Fecha: "2026-10-07T13:18:43", TotalSi: 2, TotalNo: 1, TotalAbstencion: 1, TotalDispensado: 0 };
    const votes = findArray(parseXml(xml), "Voto").map((x) => {
      const o = x as Record<string, unknown>;
      return { votacionId: 90328, diputadoId: voteDeputyId(o), ...parseOpcion(o.OpcionVoto) };
    });
    expect(votes).toHaveLength(5);
    // Every vote must carry its deputy: the first live ficha run found none because of this.
    expect(votes.map((v) => v.diputadoId)).toEqual([803, 815, 843, 872, 900]);
    // "No Vota" must not be counted as a "No": that was the bug in the first live run.
    expect(reconcileVotes(v, votes)).toBeNull();
    expect(reconcileVotes({ ...v, TotalNo: 2 }, votes)).toMatch(/no cuadran/);
  });

  it("collects every deputy from DiputadoPeriodo wrappers with their current party", () => {
    // Shape as returned by retornarDiputadosPeriodoActual on 17 Oct 2026 (each Diputado wrapped in a DiputadoPeriodo).
    const dp = (id: number, sexo: string, parties: [string, string, string | null][]) => `<DiputadoPeriodo><FechaInicio>2026-03-11T00:00:00</FechaInicio><FechaTermino xsi:nil="true" />
<Diputado><Id>${id}</Id><Nombre>N${id}</Nombre><Nombre2 /><ApellidoPaterno>P</ApellidoPaterno><ApellidoMaterno>M</ApellidoMaterno><Sexo Valor="0">${sexo}</Sexo><Militancias>
${parties.map(([a, n, end]) => `<Militancia><FechaInicio>2019-01-01T00:00:00</FechaInicio>${end ? `<FechaTermino>${end}</FechaTermino>` : `<FechaTermino xsi:nil="true" />`}<Partido><Id>${a}</Id><Nombre>${n}</Nombre><Alias>${a}</Alias></Partido></Militancia>`).join("")}
</Militancias></Diputado></DiputadoPeriodo>`;
    const xml = `<?xml version="1.0" encoding="utf-8"?><DiputadosPeriodoColeccion xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://opendata.camara.cl/camaradiputados/v1">
${dp(1, "Femenino", [["IND", "Independientes", "2019-09-26T23:59:59"], ["FA", "Frente Amplio", null]])}
${dp(2, "Masculino", [["UDI", "Unión Demócrata Independiente", null]])}
${dp(3, "Masculino", [["UDI", "Unión Demócrata Independiente", null]])}
</DiputadosPeriodoColeccion>`;
    const ds = parseDeputies(xml);
    expect(ds).toHaveLength(3);
    expect(ds[0].partido.alias).toBe("FA");
    expect(ds.filter((d) => d.sexo === "Femenino")).toHaveLength(1);
  });

  it("parses Cámara-style XML with namespaces and attributes", () => {
    const xml = `<?xml version="1.0"?><VotacionesColeccion xmlns="http://opendata.camara.cl/camaradiputados/v1"><Votacion><Id>99</Id><Fecha>2026-05-14T12:00:00</Fecha><TotalSi>80</TotalSi><TotalNo>60</TotalNo><TotalAbstencion>3</TotalAbstencion><TotalDispensado>0</TotalDispensado><Tipo Valor="1">General</Tipo></Votacion></VotacionesColeccion>`;
    const arr = findArray(parseXml(xml), "Votacion");
    expect(arr).toHaveLength(1);
    expect((arr[0] as Record<string, unknown>).TotalSi).toBe(80);
  });

  it("finds a partida row in IFP-like text and refuses nothing else", () => {
    const pages = [{ num: 88, text: "Ministerio de Salud 18.314.764.816 4,7\nMinisterio de Minería 56.085.118 -0,4" }];
    expect(findPartidaRow(pages, "Ministerio de Salud")).toEqual([{ page: 88, milesCLP: 18314764816, varPct: 4.7 }]);
    expect(findPartidaRow(pages, "Ministerio de Energía")).toEqual([]);
  });
});

describe("fichas", () => {
  it("knows a deputy's party on each date from the Cámara's militancias", () => {
    const ms = [
      { desde: "2022-03-11", hasta: "2024-07-02", alias: "IND" },
      { desde: "2024-07-03", hasta: "2026-03-10", alias: "FA" },
    ];
    expect(partyAt(ms, "2023-04-11")).toBe("IND");
    expect(partyAt(ms, "2025-01-29")).toBe("FA");
    expect(partyAt(ms, "2026-05-01")).toBeNull();
  });

  it("takes the party majority only when it is clear", () => {
    expect(majority([1, 1, 1, 0])).toBe(1);
    expect(majority([1, 0])).toBeNull();
    expect(majority([4, 4])).toBeNull();
  });

  it("has well-formed fichas whose quotes are long enough to verify", () => {
    const cfgs = loadFichaConfigs();
    expect(cfgs.length).toBeGreaterThan(0);
    for (const c of cfgs) for (const p of c.promesas) expect(p.cita.split(" ").length).toBeGreaterThanOrEqual(4);
  });
});

describe("treemap", () => {
  it("covers the whole area with no tile lost", () => {
    const rects = squarify([{ key: "a", value: 6 }, { key: "b", value: 6 }, { key: "c", value: 4 }, { key: "d", value: 3 }, { key: "e", value: 1 }], 160, 100);
    expect(rects).toHaveLength(5);
    const area = rects.reduce((s, r) => s + r.w * r.h, 0);
    expect(area).toBeCloseTo(100 * 100, 3);
    for (const r of rects) expect(r.x + r.w).toBeLessThanOrEqual(100.0001);
  });
});
