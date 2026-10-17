import Link from "next/link";
import { loadFacts, dataMode, snapshotInfo } from "@/lib/facts";
import { href } from "@/lib/base";
import { fmtDate, fmtEditionDate } from "@/lib/format";

const NAV = [
  { href: "/", label: "Portada" },
  { href: "/presupuesto", label: "Presupuesto" },
  { href: "/promesas", label: "Promesas y votos" },
  { href: "/hallazgos", label: "Hallazgos" },
  { href: "/fuentes", label: "Fuentes" },
];

export function Header({ current }: { current: string }) {
  const facts = loadFacts().filter((f) => f.status !== "pendiente");
  const official = facts.filter((f) => f.status === "oficial").length;
  const demo = dataMode() === "demo";
  const snap = snapshotInfo();
  const edition = snap ? new Date(snap.takenAt) : new Date();
  const allOk = snap ? snap.ok === snap.total : false;
  return (
    <header className="hdr-bar">
      <div className="hdr">
        <div className="hdr-top">
          <Link href="/" className="brand" aria-label="Chile Abierto, portada">
            <span className="brand-mark" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.2l7.1-.6z" fill="#fff" /></svg>
            </span>
            <span>Chile Abierto</span>
          </Link>
          <div className="hdr-meta">
            <span className="hdr-date">{fmtEditionDate(edition)} · Edición diaria</span>
            <Link href="/fuentes" className={`hdr-chip${allOk || !demo ? " ok" : ""}`} title="Cómo verificamos cada dato">
              <span className="dotlive pulse" aria-hidden="true" />
              {snap ? `${snap.ok} de ${snap.total} fuentes al día · ${official} datos oficiales` : `${official} datos oficiales${demo ? " · con ejemplos" : ""}`}
            </Link>
            <Link href="/hallazgos#preguntas" className="icon-btn" aria-label="Buscar en las preguntas respondidas">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
            </Link>
          </div>
        </div>
        <nav aria-label="Secciones" className="hdr-nav">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={current === n.href ? "page" : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  const snap = snapshotInfo();
  return (
    <footer className="site">
      <span style={{ flexBasis: "100%" }}>
        {snap ? `Datos al ${fmtDate(snap.takenAt)}: ${snap.ok} de ${snap.total} conectores oficiales al día.` : "Datos semilla verificados manualmente; aún no se ejecuta una ingesta automática."} El sitio se reconstruye cada día.
      </span>
      <span>Fuentes: DIPRES · Cámara de Diputadas y Diputados · Servel · Banco Central · ChileCompra · INE · Consejo para la Transparencia</span>
      <span style={{ display: "flex", gap: 18 }}>
        <Link href="/fuentes">Cómo verificamos</Link>
        <a href={href("/datos/facts.json")}>Datos abiertos (JSON)</a>
      </span>
    </footer>
  );
}
