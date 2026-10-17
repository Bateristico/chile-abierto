"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BASE } from "@/lib/base";
import type { ClientRow } from "@/lib/leyes/load";
import { PROFUNDIDAD, type Profundidad } from "@/lib/leyes/labels";
import { STATUS_LABEL, type BillStatus } from "@/lib/leyes/types";
import { DepthChip, ImpactDial, StatusChip } from "./LawBits";

interface F {
  q: string;
  st: string;
  ini: string;
  p: string;
  desde: string;
  orden: "reciente" | "lenta" | "rapida" | "impacto";
}
const EMPTY: F = { q: "", st: "", ini: "", p: "", desde: "", orden: "reciente" };
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const fmtDay = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });
const dur = (d: number) => (d < 60 ? `${d} días` : d < 730 ? `${Math.round(d / 30.4)} meses` : `${(d / 365).toFixed(1).replace(".", ",")} años`);

export function LeyesExplorer({ initial }: { initial?: Partial<F> }) {
  const [rows, setRows] = useState<ClientRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState<F>({ ...EMPTY, ...initial });
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    const s = new URLSearchParams(window.location.search);
    setF((x) => ({ ...x, q: s.get("q") ?? x.q, st: s.get("st") ?? x.st, ini: s.get("ini") ?? x.ini, p: s.get("p") ?? x.p, desde: s.get("desde") ?? x.desde, orden: (s.get("orden") as F["orden"]) ?? x.orden }));
    fetch(`${BASE}/datos/leyes.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { rows: ClientRow[] }) => setRows(d.rows))
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v && !(k === "orden" && v === "reciente")) s.set(k, String(v));
    window.history.replaceState(null, "", `${window.location.pathname}${s.size ? `?${s}` : ""}`);
    setLimit(50);
  }, [f]);

  const list = useMemo(() => {
    if (!rows) return [];
    const q = norm(f.q.trim());
    const out = rows.filter(
      (r) =>
        (!q || norm(r.t).includes(q) || r.b.includes(q) || (r.ley ?? "").includes(q)) &&
        (!f.st || r.st === f.st) &&
        (!f.ini || r.i === f.ini) &&
        (!f.p || (f.p === "sin" ? !r.p : r.p === f.p)) &&
        (!f.desde || (f.st === "ley" ? (r.pub ?? "") >= f.desde : r.f >= f.desde)),
    );
    const key: Record<F["orden"], (a: ClientRow, b: ClientRow) => number> = {
      reciente: (a, b) => (b.pub ?? b.f).localeCompare(a.pub ?? a.f),
      lenta: (a, b) => (b.d ?? -1) - (a.d ?? -1),
      rapida: (a, b) => (a.d ?? 1e9) - (b.d ?? 1e9),
      impacto: (a, b) => (b.dial ?? 0) - (a.dial ?? 0),
    };
    return out.sort(key[f.orden]);
  }, [rows, f]);

  const set = (k: keyof F) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <section className="card" style={{ gap: 16 }} aria-labelledby="lx-t">
      <div>
        <span className="kicker">Explorador</span>
        <h2 id="lx-t" className="sec-title">Cada proyecto y cada ley</h2>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        <label className="field" style={{ gridColumn: "span 2" }}>
          Buscar
          <input value={f.q} onChange={set("q")} placeholder="Título, boletín o número de ley" />
        </label>
        <label className="field">
          Estado
          <select value={f.st} onChange={set("st")}>
            <option value="">Todos</option>
            {(Object.keys(STATUS_LABEL) as BillStatus[]).filter((k) => k !== "otro").map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
          </select>
        </label>
        <label className="field">
          Quién lo propuso
          <select value={f.ini} onChange={set("ini")}>
            <option value="">Todos</option>
            <option value="M">Gobierno (Mensaje)</option>
            <option value="m">Parlamentarios (Moción)</option>
          </select>
        </label>
        <label className="field">
          Profundidad
          <select value={f.p} onChange={set("p")}>
            <option value="">Todas</option>
            {(Object.keys(PROFUNDIDAD) as Profundidad[]).map((k) => <option key={k} value={k}>{PROFUNDIDAD[k].label}</option>)}
            <option value="sin">Sin clasificar</option>
          </select>
        </label>
        <label className="field">
          Ordenar
          <select value={f.orden} onChange={set("orden")}>
            <option value="reciente">Más recientes</option>
            <option value="lenta">Más lentas en ser ley</option>
            <option value="rapida">Más rápidas en ser ley</option>
            <option value="impacto">Mayor impacto</option>
          </select>
        </label>
      </div>

      {error && <p role="alert">No se pudo cargar la lista ({error}).</p>}
      {!rows && !error && <p className="muted">Cargando proyectos…</p>}
      {rows && (
        <p className="small muted" aria-live="polite">
          {list.length.toLocaleString("es-CL")} de {rows.length.toLocaleString("es-CL")} proyectos
          {f.st || f.ini || f.p || f.q ? (
            <>
              {" · "}
              <button type="button" className="linklike" onClick={() => setF(EMPTY)}>Quitar filtros</button>
            </>
          ) : null}
        </p>
      )}
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {list.slice(0, limit).map((r) => {
          const body = (
            <>
              <span className="vtitle vart">{r.t}</span>
              <span style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                <StatusChip st={r.st as BillStatus} />
                <span className="chip">{r.i === "M" ? "Gobierno" : "Moción"}</span>
                {(r.p || r.st === "ley") && <DepthChip p={r.p as Profundidad | null} por={r.por} />}
                {r.u && <span className="chip warn">Urgencia {r.u.toLowerCase()}</span>}
                {r.dial && <ImpactDial nivel={r.dial} size={34} />}
              </span>
              <span className="tiny muted">
                Boletín {r.b} · ingresó el {fmtDay(r.f)}
                {r.ley && ` · Ley ${r.ley}`}
                {r.pub && ` publicada el ${fmtDay(r.pub)}`}
                {r.d !== null && ` · tardó ${dur(r.d)}${r.v ? ` (${r.v.toLowerCase()} para su tipo)` : ""}`}
                {r.st === "tramite" && ` · ${r.et}`}
              </span>
            </>
          );
          return (
            <li key={r.b}>
              {r.pg ? (
                <Link className="vrow" href={`/leyes/${r.b}/`} style={{ textDecoration: "none", background: "var(--ground)" }}>{body}</Link>
              ) : (
                <a className="vrow" href={`https://tramitacion.senado.cl/appsenado/templates/tramitacion/index.php?boletin_ini=${r.b}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", background: "var(--ground)" }}>{body}</a>
              )}
            </li>
          );
        })}
      </ol>
      {list.length > limit && (
        <button type="button" className="btn" onClick={() => setLimit((l) => l + 100)} style={{ alignSelf: "center" }}>
          Mostrar 100 más
        </button>
      )}
    </section>
  );
}
