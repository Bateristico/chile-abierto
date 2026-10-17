"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BASE } from "@/lib/base";
import type { ClientPeriod } from "@/lib/congreso/load";

export interface DipRow {
  id: number;
  nombre: string;
  partido: string;
  militancias: [string, string, string][];
  registradas: number;
  participacion: number | null;
  linea: number | null;
  comparables: number;
  ganador: number | null;
  x: number | null;
  y: number | null;
  cercanos: { id: number; share: number }[];
  lejanos: { id: number; share: number }[];
}

export interface DipPeriod {
  id: number;
  nombre: string;
  rows: DipRow[];
}

const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const fmtDay = (iso: string) => new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });

export function DiputadosView({ periods, colors, curated }: { periods: DipPeriod[]; colors: Record<string, string>; curated: Record<string, string> }) {
  const [pid, setPid] = useState(periods[0].id);
  const [sel, setSel] = useState<number | null>(null);
  const [other, setOther] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [party, setParty] = useState("");
  const [sort, setSort] = useState<"nombre" | "participacion" | "linea">("nombre");

  useEffect(() => {
    const s = new URLSearchParams(window.location.search);
    const p = Number(s.get("p"));
    if (p && periods.some((x) => x.id === p)) setPid(p);
    if (s.get("id")) setSel(Number(s.get("id")));
    if (s.get("con")) setOther(Number(s.get("con")));
  }, [periods]);

  useEffect(() => {
    const s = new URLSearchParams();
    s.set("p", String(pid));
    if (sel) s.set("id", String(sel));
    if (other) s.set("con", String(other));
    window.history.replaceState(null, "", `${window.location.pathname}?${s}`);
  }, [pid, sel, other]);

  const P = periods.find((p) => p.id === pid)!;
  const byId = useMemo(() => new Map(P.rows.map((r) => [r.id, r])), [P]);
  const parties = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of P.rows) c.set(r.partido, (c.get(r.partido) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [P]);
  const list = useMemo(() => {
    const nq = norm(q.trim());
    const xs = P.rows.filter((r) => (!nq || norm(r.nombre).includes(nq)) && (!party || r.partido === party));
    if (sort === "nombre") xs.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    else xs.sort((a, b) => ((sort === "linea" ? a.linea : a.participacion) ?? 2) - ((sort === "linea" ? b.linea : b.participacion) ?? 2));
    return xs;
  }, [P, q, party, sort]);
  const color = (a: string) => colors[a] ?? "#C9CAD3";
  const d = sel !== null ? byId.get(sel) : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <section className="card" style={{ gap: 14, padding: 24 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div className="seg" role="group" aria-label="Periodo">
            {periods.map((p) => <button key={p.id} type="button" aria-pressed={pid === p.id} onClick={() => { setPid(p.id); setSel(null); setOther(null); }}>{p.nombre}</button>)}
          </div>
          <span className="small muted">{list.length} de {P.rows.length}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          <label className="field"><span>Buscar por nombre</span><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o apellido" /></label>
          <label className="field"><span>Partido</span>
            <select value={party} onChange={(e) => setParty(e.target.value)}>
              <option value="">Todos</option>
              {parties.map(([a, n]) => <option key={a} value={a}>{a} · {n}</option>)}
            </select>
          </label>
          <label className="field"><span>Ordenar</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="nombre">Por nombre</option>
              <option value="participacion">Menor participación primero</option>
              <option value="linea">Más se aparta de su partido primero</option>
            </select>
          </label>
        </div>
      </section>

      <section className="row" style={{ alignItems: "flex-start" }}>
        <ul className="vlist" style={{ flex: "1 1 360px", minWidth: 0, listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
          {list.map((r) => (
            <li key={r.id}>
              <button type="button" className="vrow" aria-pressed={sel === r.id} onClick={() => { setSel(r.id); setOther(null); if (window.innerWidth < 760) requestAnimationFrame(() => document.getElementById("vdetail")?.scrollIntoView({ behavior: "smooth" })); }} style={{ gap: 4 }}>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}><i style={{ width: 10, height: 10, borderRadius: 5, background: color(r.partido), display: "inline-block", flex: "none" }} /><strong style={{ fontSize: 15 }}>{r.nombre}</strong></span>
                <span className="tiny muted">{r.partido} · participa {pct(r.participacion)} · con su partido {pct(r.linea)}</span>
              </button>
            </li>
          ))}
        </ul>
        <aside id="vdetail" className="vdetail" style={{ flex: "1 1 460px", minWidth: 0 }} aria-live="polite">
          {d ? <Ficha d={d} P={P} byId={byId} color={color} other={other} setOther={setOther} setSel={setSel} curated={curated[`${P.id}:${d.id}`]} /> : (
            <div className="card small" style={{ color: "var(--ink-2)" }}>Elige a una diputada o diputado para ver cómo vota, con quién coincide y compararlo con otra persona.</div>
          )}
        </aside>
      </section>
    </div>
  );
}

function Ficha({ d, P, byId, color, other, setOther, setSel, curated }: { d: DipRow; P: DipPeriod; byId: Map<number, DipRow>; color: (a: string) => string; other: number | null; setOther: (n: number | null) => void; setSel: (n: number) => void; curated?: string }) {
  const W = 300, H = 210;
  const X = (x: number) => W / 2 + x * (W / 2 - 10);
  const Y = (y: number) => H / 2 - y * (H / 2 - 10);
  return (
    <div className="card" style={{ gap: 16, padding: 22 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="kicker">Ficha · periodo {P.nombre}</span>
        <h2 style={{ fontSize: 26, lineHeight: 1.15 }}>{d.nombre}</h2>
        <span className="small muted">{d.militancias.map((m) => `${m[2]} desde ${fmtDay(m[0])}`).join(" · ")}</span>
      </div>
      {curated && <Link href={curated} className="btn primary" style={{ alignSelf: "flex-start" }}>Ver promesas y votos con datos reales</Link>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
        <div style={{ background: "var(--ground)", borderRadius: 14, padding: "10px 12px" }}><span className="tiny muted" style={{ display: "block" }}>Participación</span><span className="bignum" style={{ fontSize: 24 }}>{pct(d.participacion)}</span></div>
        <div style={{ background: "var(--ground)", borderRadius: 14, padding: "10px 12px" }}><span className="tiny muted" style={{ display: "block" }}>Con su partido</span><span className="bignum" style={{ fontSize: 24 }}>{pct(d.linea)}</span></div>
        <div style={{ background: "var(--ground)", borderRadius: 14, padding: "10px 12px" }}><span className="tiny muted" style={{ display: "block" }}>Del lado ganador</span><span className="bignum" style={{ fontSize: 24 }}>{pct(d.ganador)}</span></div>
      </div>
      <p className="tiny muted">
        {d.registradas.toLocaleString("es-CL")} votaciones con su registro. «Con su partido» compara su voto con la mayoría de los demás miembros de su partido en {d.comparables.toLocaleString("es-CL")} votaciones
        {d.comparables < 30 ? " (muy pocas para concluir)" : ""}.
      </p>
      {d.x !== null && d.y !== null && (
        <figure style={{ margin: 0 }}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 380 }} role="img" aria-label={`Posición de ${d.nombre} en el mapa político`}>
            <rect x="0" y="0" width={W} height={H} rx="12" fill="var(--ground)" />
            {P.rows.filter((r) => r.x !== null).map((r) => <circle key={r.id} cx={X(r.x!)} cy={Y(r.y!)} r="3" fill={color(r.partido)} fillOpacity={0.25} />)}
            <circle cx={X(d.x)} cy={Y(d.y)} r="7" fill={color(d.partido)} stroke="var(--ink)" strokeWidth="2.5" />
          </svg>
          <figcaption className="tiny muted">Su lugar en el <Link href="/congreso">mapa político</Link>, estimado solo con votos.</figcaption>
        </figure>
      )}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {[["Vota más parecido a", d.cercanos], ["Vota más distinto a", d.lejanos]].map(([title, xs]) => (
          <div key={title as string} style={{ flex: "1 1 200px" }}>
            <strong className="small">{title as string}</strong>
            <ul style={{ margin: "6px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
              {(xs as { id: number; share: number }[]).map((c) => {
                const r = byId.get(c.id);
                return (
                  <li key={c.id} className="small" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <button type="button" onClick={() => setSel(c.id)} style={{ border: 0, background: "none", padding: 0, color: "var(--blue)", cursor: "pointer", textAlign: "left", font: "inherit" }}>{r?.nombre ?? c.id} <span className="muted">({r?.partido})</span></button>
                    <span style={{ fontWeight: 700 }}>{pct(c.share)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <Comparador d={d} P={P} byId={byId} other={other} setOther={setOther} />
      <Link href={`/votaciones?p=${P.id}&dip=${d.id}`} className="btn" style={{ alignSelf: "flex-start" }}>Ver todas sus votaciones</Link>
    </div>
  );
}

function Comparador({ d, P, byId, other, setOther }: { d: DipRow; P: DipPeriod; byId: Map<number, DipRow>; other: number | null; setOther: (n: number | null) => void }) {
  const [data, setData] = useState<ClientPeriod | null>(null);
  useEffect(() => {
    if (other === null || data?.id === P.id) return;
    fetch(`${BASE}/datos/congreso/p${P.id}.json`).then((r) => r.json()).then(setData).catch(() => setData(null));
  }, [other, P.id, data]);
  const result = useMemo(() => {
    if (!data || other === null) return null;
    const i = data.orden.indexOf(d.id);
    const j = data.orden.indexOf(other);
    if (i < 0 || j < 0) return null;
    let both = 0, same = 0;
    const diff: { id: number; f: string; t: string; a: string; b: string }[] = [];
    const lab: Record<string, string> = { "1": "A favor", "0": "En contra", "2": "Abstención" };
    for (const v of data.votaciones) {
      const a = v.c.charAt(i), b = v.c.charAt(j);
      if (!(a in lab) || !(b in lab)) continue;
      both++;
      if (a === b) same++;
      else if (diff.length < 15) diff.push({ id: v.id, f: v.f, t: (v.b && data.proyectos[v.b]?.nombre) || v.d, a: lab[a], b: lab[b] });
    }
    return { both, same, diff };
  }, [data, d.id, other]);
  const o = other !== null ? byId.get(other) : undefined;
  return (
    <div style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <label className="field"><span>Comparar con</span>
        <select value={other ?? ""} onChange={(e) => setOther(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Elige a otra persona</option>
          {[...P.rows].filter((r) => r.id !== d.id).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")).map((r) => <option key={r.id} value={r.id}>{r.nombre} ({r.partido})</option>)}
        </select>
      </label>
      {other !== null && !result && <span className="small muted">Calculando…</span>}
      {o && result && (
        <>
          <p style={{ fontSize: 17 }}>
            <strong>{d.nombre}</strong> y <strong>{o.nombre}</strong> votaron igual en <strong>{pct(result.both ? result.same / result.both : null)}</strong> de las {result.both.toLocaleString("es-CL")} votaciones en que ambos votaron.
          </p>
          {result.diff.length > 0 && (
            <details className="small">
              <summary style={{ fontWeight: 700, cursor: "pointer", minHeight: 32 }}>Las votaciones más recientes en que difirieron</summary>
              <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                {result.diff.map((x) => (
                  <li key={x.id}>
                    <Link href={`/votaciones?p=${P.id}&v=${x.id}`}>{x.t}</Link>
                    <span className="tiny muted" style={{ display: "block" }}>{fmtDay(x.f)} · {d.nombre.split(" ")[0]}: {x.a} · {o.nombre.split(" ")[0]}: {x.b}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
