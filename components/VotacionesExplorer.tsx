"use client";

import { useEffect, useMemo, useState } from "react";
import { BASE } from "@/lib/base";
import type { ClientPeriod } from "@/lib/congreso/load";
import { voteTitle, type Votacion } from "@/lib/congreso/types";

const OPT: Record<string, { label: string; color: string }> = {
  "1": { label: "A favor", color: "var(--blue)" },
  "0": { label: "En contra", color: "var(--copper-fill)" },
  "2": { label: "Abstención", color: "var(--amber)" },
  "4": { label: "No vota", color: "var(--grey)" },
};
const optOf = (c: string) => OPT[c] ?? { label: c === "." ? "Sin registro" : `Código ${c}`, color: "var(--line)" };

type Dip = ClientPeriod["diputados"][number];
const partyOn = (d: Dip | undefined, date: string) => d?.m.find((m) => m[0] <= date && date <= m[1])?.[2] ?? d?.m.at(-1)?.[2] ?? "SIN";

interface Filters {
  q: string;
  tema: string;
  res: string;
  cerca: boolean;
  partido: string;
  dividido: boolean;
  dip: number | null;
  b: string;
  partida: string;
}
const EMPTY: Filters = { q: "", tema: "", res: "", cerca: false, partido: "", dividido: false, dip: null, b: "", partida: "" };

function readUrl(): { p: number; v: number | null; f: Filters } {
  const s = new URLSearchParams(window.location.search);
  return {
    p: Number(s.get("p")) || 0,
    v: Number(s.get("v")) || null,
    f: { q: s.get("q") ?? "", tema: s.get("tema") ?? "", res: s.get("res") ?? "", cerca: s.get("cerca") === "1", partido: s.get("partido") ?? "", dividido: s.get("dividido") === "1", dip: Number(s.get("dip")) || null, b: s.get("b") ?? "", partida: s.get("partida") ?? "" },
  };
}

function writeUrl(p: number, v: number | null, f: Filters) {
  const s = new URLSearchParams();
  s.set("p", String(p));
  if (f.q) s.set("q", f.q);
  if (f.tema) s.set("tema", f.tema);
  if (f.res) s.set("res", f.res);
  if (f.cerca) s.set("cerca", "1");
  if (f.partido) s.set("partido", f.partido);
  if (f.dividido) s.set("dividido", "1");
  if (f.dip) s.set("dip", String(f.dip));
  if (f.b) s.set("b", f.b);
  if (f.partida) s.set("partida", f.partida);
  if (v) s.set("v", String(v));
  window.history.replaceState(null, "", `${window.location.pathname}?${s}`);
}

const fmtDay = (iso: string) => new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function VotacionesExplorer({ periodos }: { periodos: { id: number; nombre: string; votaciones: number }[] }) {
  const [pid, setPid] = useState(periodos[0]?.id ?? 11);
  const [data, setData] = useState<ClientPeriod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState<Filters>(EMPTY);
  const [sel, setSel] = useState<number | null>(null);
  const [limit, setLimit] = useState(60);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const u = readUrl();
    if (u.p && periodos.some((x) => x.id === u.p)) setPid(u.p);
    setF(u.f);
    setSel(u.v);
    setReady(true);
  }, [periodos]);

  useEffect(() => {
    if (!ready) return;
    setData(null);
    setError(null);
    fetch(`${BASE}/datos/congreso/p${pid}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: ClientPeriod) => setData(d))
      .catch((e) => setError(String(e.message ?? e)));
  }, [pid, ready]);

  useEffect(() => {
    if (ready) writeUrl(pid, sel, f);
  }, [pid, sel, f, ready]);

  const byId = useMemo(() => new Map((data?.diputados ?? []).map((d) => [d.id, d])), [data]);
  const idx = useMemo(() => new Map((data?.orden ?? []).map((id, i) => [id, i])), [data]);

  const temas = useMemo(() => {
    if (!data) return [];
    const count = new Map<string, number>();
    for (const v of data.votaciones) for (const m of (v.b && data.proyectos[v.b]?.materias) || []) count.set(m, (count.get(m) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
  }, [data]);

  const partidos = useMemo(() => {
    if (!data) return [];
    const today = data.fin < new Date().toISOString().slice(0, 10) ? data.fin : new Date().toISOString().slice(0, 10);
    const seats = new Map<string, number>();
    for (const d of data.diputados) seats.set(partyOn(d, today), (seats.get(partyOn(d, today)) ?? 0) + 1);
    return [...seats.entries()].sort((a, b) => b[1] - a[1]);
  }, [data]);

  const splitOf = (v: Votacion, party: string) => {
    const s = { "1": 0, "0": 0, "2": 0, "4": 0 } as Record<string, number>;
    if (!data) return s;
    const date = v.f.slice(0, 10);
    for (let i = 0; i < data.orden.length; i++) {
      const c = v.c.charAt(i);
      if (c === "." || partyOn(byId.get(data.orden[i]), date) !== party) continue;
      s[c] = (s[c] ?? 0) + 1;
    }
    return s;
  };

  const rows = useMemo(() => {
    if (!data) return [];
    const q = norm(f.q.trim());
    return data.votaciones.filter((v) => {
      const p = v.b ? data.proyectos[v.b] : undefined;
      if (f.b && v.b !== f.b) return false;
      if (f.partida && !new RegExp(`\\bPart(?:ida)?\\.?\\s*(?:N[°º]\\s*)?0*${Number(f.partida)}\\b`, "i").test(v.art ?? "")) return false;
      if (q && !norm(`${v.d} ${v.art ?? ""} ${p?.nombre ?? ""}`).includes(q)) return false;
      if (f.tema && !p?.materias.includes(f.tema)) return false;
      if (f.res === "aprobada" && !/aprobad/i.test(v.r)) return false;
      if (f.res === "rechazada" && !/rechazad/i.test(v.r)) return false;
      if (f.cerca && Math.abs(v.si - v.no) > 5) return false;
      if (f.partido && f.dividido) {
        const s = splitOf(v, f.partido);
        const n = s["1"] + s["0"] + s["2"];
        if (n < 3 || Math.max(s["1"], s["0"], s["2"]) / n > 0.8) return false;
      }
      if (f.dip !== null && !idx.has(f.dip)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, f, idx]);

  const selected = data?.votaciones.find((v) => v.id === sel) ?? null;
  const set = (patch: Partial<Filters>) => {
    setF((x) => ({ ...x, ...patch }));
    setLimit(60);
  };
  const dipIdx = f.dip !== null ? idx.get(f.dip) : undefined;
  const dipName = f.dip !== null ? byId.get(f.dip)?.n : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <section className="card" style={{ gap: 16, padding: 24 }} aria-label="Filtros">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          <div className="seg" role="group" aria-label="Periodo legislativo">
            {periodos.map((p) => (
              <button key={p.id} type="button" aria-pressed={pid === p.id} onClick={() => { setPid(p.id); setSel(null); set({ dip: null }); }}>
                {p.nombre}
              </button>
            ))}
          </div>
          <span className="small muted" aria-live="polite">
            {data ? `${rows.length.toLocaleString("es-CL")} de ${data.votaciones.length.toLocaleString("es-CL")} votaciones` : error ? "" : "Cargando votaciones…"}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          <label className="field">
            <span>Buscar</span>
            <input type="search" value={f.q} placeholder="Proyecto, boletín, artículo…" onChange={(e) => set({ q: e.target.value })} />
          </label>
          <label className="field">
            <span>Tema</span>
            <select value={f.tema} onChange={(e) => set({ tema: e.target.value })}>
              <option value="">Todos</option>
              {temas.map(([t, n]) => <option key={t} value={t}>{t} ({n})</option>)}
            </select>
          </label>
          <label className="field">
            <span>Resultado</span>
            <select value={f.res} onChange={(e) => set({ res: e.target.value })}>
              <option value="">Todos</option>
              <option value="aprobada">Aprobadas</option>
              <option value="rechazada">Rechazadas</option>
            </select>
          </label>
          <label className="field">
            <span>Mirar un partido</span>
            <select value={f.partido} onChange={(e) => set({ partido: e.target.value, dividido: e.target.value ? f.dividido : false })}>
              <option value="">Ninguno</option>
              {partidos.map(([a, n]) => <option key={a} value={a}>{data?.partidos[a] ?? a} · {n}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Mirar un diputado</span>
            <select value={f.dip ?? ""} onChange={(e) => set({ dip: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Ninguno</option>
              {[...(data?.diputados ?? [])].sort((a, b) => a.n.localeCompare(b.n, "es")).map((d) => <option key={d.id} value={d.id}>{d.n}</option>)}
            </select>
          </label>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" className="pill" aria-pressed={f.cerca} onClick={() => set({ cerca: !f.cerca })}>Solo ajustadas (5 votos o menos)</button>
          {f.partido && <button type="button" className="pill" aria-pressed={f.dividido} onClick={() => set({ dividido: !f.dividido })}>Solo donde {f.partido} se dividió</button>}
          {(f.b || f.partida) && <button type="button" className="pill" aria-pressed onClick={() => set({ b: "", partida: "" })}>Boletín {f.b}{f.partida ? ` · partida ${f.partida}` : ""} ✕</button>}
          {JSON.stringify(f) !== JSON.stringify(EMPTY) && <button type="button" className="pill" onClick={() => set(EMPTY)}>Limpiar filtros</button>}
        </div>
      </section>

      {error && <p className="card">No se pudieron cargar las votaciones de este periodo ({error}). Se publican cuando corre la captura diaria.</p>}

      {data && (
        <section className="row" style={{ alignItems: "flex-start" }}>
          <ol className="vlist" style={{ flex: "999 1 520px", minWidth: 0, listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }} aria-label="Votaciones">
            {rows.slice(0, limit).map((v) => {
              const p = v.b ? data.proyectos[v.b] : undefined;
              const total = v.si + v.no + v.ab || 1;
              const s = f.partido ? splitOf(v, f.partido) : null;
              const mine = dipIdx !== undefined ? v.c.charAt(dipIdx) : null;
              return (
                <li key={v.id}>
                  <button type="button" className="vrow" aria-pressed={sel === v.id} onClick={() => { setSel(v.id); if (window.innerWidth < 760) requestAnimationFrame(() => document.getElementById("vdetail")?.scrollIntoView({ behavior: "smooth", block: "start" })); }}>
                    <span style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <span className="tiny muted">{fmtDay(v.f)} · {[v.tipo, v.tram].filter(Boolean).join(" · ") || v.k || "Votación en Sala"}</span>
                      <span style={{ display: "flex", gap: 6 }}>
                        {Math.abs(v.si - v.no) <= 5 && <span className="chip warn">Ajustada</span>}
                        <span className={`chip ${/aprobad/i.test(v.r) ? "ok" : /rechazad/i.test(v.r) ? "bad" : ""}`}>{v.r || "—"}</span>
                      </span>
                    </span>
                    <strong className="vtitle">{p?.nombre || voteTitle(v)}</strong>
                    {v.art && <span className="tiny muted vart">{v.art}</span>}
                    <span className="vbar" aria-label={`${v.si} a favor, ${v.no} en contra, ${v.ab} abstenciones`}>
                      <span style={{ flex: v.si / total, background: OPT["1"].color }} />
                      <span style={{ flex: v.no / total, background: OPT["0"].color }} />
                      <span style={{ flex: v.ab / total, background: OPT["2"].color }} />
                    </span>
                    <span className="tiny" style={{ display: "flex", gap: 12, flexWrap: "wrap", color: "var(--ink-2)" }}>
                      <span>{v.si} a favor · {v.no} en contra · {v.ab} abst.</span>
                      {s && <span><strong>{f.partido}</strong>: {s["1"]} sí · {s["0"]} no · {s["2"]} abst.{s["4"] ? ` · ${s["4"]} no vota` : ""}</span>}
                      {mine !== null && <span><strong>{dipName}</strong>: <span style={{ color: mine === "." ? "var(--muted)" : undefined, fontWeight: 700 }}>{optOf(mine).label}</span></span>}
                    </span>
                  </button>
                </li>
              );
            })}
            {rows.length > limit && (
              <li><button type="button" className="btn" style={{ width: "100%" }} onClick={() => setLimit((l) => l + 100)}>Mostrar 100 más</button></li>
            )}
            {rows.length === 0 && <li className="card small">Ninguna votación cumple estos filtros.</li>}
          </ol>
          <aside id="vdetail" className="vdetail" style={{ flex: "1 1 400px", minWidth: 0 }} aria-live="polite">
            {selected ? <VoteDetail v={selected} data={data} byId={byId} highlight={dipIdx} /> : (
              <div className="card small" style={{ color: "var(--ink-2)" }}>Elige una votación para ver cómo votó cada diputado y cada partido.</div>
            )}
          </aside>
        </section>
      )}
    </div>
  );
}

function VoteDetail({ v, data, byId, highlight }: { v: Votacion; data: ClientPeriod; byId: Map<number, Dip>; highlight?: number }) {
  const date = v.f.slice(0, 10);
  const p = v.b ? data.proyectos[v.b] : undefined;
  const seats = data.orden.map((id, i) => ({ id, i, party: partyOn(byId.get(id), date), code: v.c.charAt(i) }));
  const size = new Map<string, number>();
  for (const s of seats) size.set(s.party, (size.get(s.party) ?? 0) + 1);
  const order = ["1", "2", "0", "4", "."];
  seats.sort((a, b) => (size.get(b.party)! - size.get(a.party)!) || a.party.localeCompare(b.party) || order.indexOf(a.code) - order.indexOf(b.code));
  const parties = [...size.entries()].sort((a, b) => b[1] - a[1]);
  const split = (party: string) => {
    const s: Record<string, number> = { "1": 0, "0": 0, "2": 0, "4": 0, ".": 0 };
    for (const x of seats) if (x.party === party) s[x.code in s ? x.code : "4"]++;
    return s;
  };
  // Hemicycle geometry
  const R = 200, rows = 8, n = seats.length;
  const radii = Array.from({ length: rows }, (_, i) => R * (0.42 + (0.58 * i) / (rows - 1)));
  const sumR = radii.reduce((a, b) => a + b, 0);
  const per = radii.map((r) => Math.round((n * r) / sumR));
  per[rows - 1] += n - per.reduce((a, b) => a + b, 0);
  const pos: { x: number; y: number; a: number }[] = [];
  radii.forEach((r, i) => {
    for (let j = 0; j < per[i]; j++) {
      const a = Math.PI - (Math.PI * j) / Math.max(1, per[i] - 1);
      pos.push({ x: R + 12 + r * Math.cos(a), y: R + 6 - r * Math.sin(a), a });
    }
  });
  pos.sort((a, b) => b.a - a.a);
  return (
    <div className="card" style={{ gap: 14, padding: 22 }}>
      <span className="kicker">{fmtDay(v.f)} · {[v.tipo, v.tram].filter(Boolean).join(" · ") || v.k || "Votación en Sala"}</span>
      <h2 style={{ fontSize: 22, lineHeight: 1.2 }}>{p?.nombre || voteTitle(v)}</h2>
      {p && <span className="tiny muted">Boletín {v.b} · {p.iniciativa}{p.materias.length ? ` · ${p.materias.slice(0, 3).join(", ")}` : ""}</span>}
      {v.art && <p className="small" style={{ color: "var(--ink-2)", maxHeight: 120, overflow: "auto" }}>{v.art}</p>}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "baseline" }}>
        <span className="bignum" style={{ fontSize: 30 }}>{v.si}–{v.no}–{v.ab}</span>
        <span className={`chip ${/aprobad/i.test(v.r) ? "ok" : /rechazad/i.test(v.r) ? "bad" : ""}`}>{v.r}</span>
        <span className="tiny muted">{v.q}</span>
      </div>
      <svg viewBox={`0 0 ${2 * R + 24} ${R + 16}`} width="100%" role="img" aria-label={`Votación: ${v.si} a favor, ${v.no} en contra, ${v.ab} abstenciones`}>
        {seats.map((s, k) => {
          const pt = pos.at(k)!;
          const o = optOf(s.code);
          const hl = highlight === s.i;
          return (
            <circle key={s.id} cx={pt.x.toFixed(1)} cy={pt.y.toFixed(1)} r={hl ? 9 : 6.2} fill={s.code === "." ? "none" : o.color} stroke={hl ? "var(--ink)" : s.code === "." ? "var(--line)" : "none"} strokeWidth={hl ? 3 : 1.2}>
              <title>{`${byId.get(s.id)?.n ?? s.id} (${s.party}): ${o.label}`}</title>
            </circle>
          );
        })}
      </svg>
      <div className="tiny" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {["1", "0", "2", "4"].map((c) => <span key={c} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><i style={{ width: 10, height: 10, borderRadius: 5, background: OPT[c].color, display: "inline-block" }} />{OPT[c].label}</span>)}
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><i style={{ width: 10, height: 10, borderRadius: 5, border: "1.2px solid var(--line)", display: "inline-block" }} />Sin registro</span>
      </div>
      <table className="ledger" style={{ fontSize: 13 }}>
        <thead><tr><th>Partido</th><th style={{ width: "45%" }}>Cómo votó</th><th>Sí</th><th>No</th><th>Abst.</th></tr></thead>
        <tbody>
          {parties.map(([party, k]) => {
            const s = split(party);
            return (
              <tr key={party}>
                <td title={data.partidos[party]}>{party} <span className="muted">({k})</span></td>
                <td>
                  <span className="vbar" style={{ height: 8 }}>
                    <span style={{ flex: s["1"], background: OPT["1"].color }} />
                    <span style={{ flex: s["0"], background: OPT["0"].color }} />
                    <span style={{ flex: s["2"], background: OPT["2"].color }} />
                    <span style={{ flex: s["4"] + s["."], background: "var(--line-soft)" }} />
                  </span>
                </td>
                <td>{s["1"]}</td><td>{s["0"]}</td><td>{s["2"]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <a className="small" href={`https://www.camara.cl/legislacion/sala_sesiones/votacion_detalle.aspx?prmIdVotacion=${v.id}`} target="_blank" rel="noopener noreferrer">Ver la votación en camara.cl</a>
    </div>
  );
}
