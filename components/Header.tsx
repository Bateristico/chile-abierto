import Link from "next/link";
import { loadFacts, dataMode } from "@/lib/facts";

const NAV = [
  { href: "/", label: "Inicio" },
  { href: "/presupuesto", label: "Presupuesto" },
  { href: "/promesas", label: "Promesas vs votos" },
  { href: "/hallazgos", label: "Hallazgos" },
  { href: "/fuentes", label: "Fuentes" },
];

export function Header({ current }: { current: string }) {
  const facts = loadFacts();
  const official = facts.filter((f) => f.status === "oficial").length;
  const demo = dataMode() === "demo";
  return (
    <header className="hdr-bar">
      <div className="hdr">
        <Link href="/" className="brand">
          <svg width="12" height="30" viewBox="0 0 12 30" aria-hidden="true">
            <rect width="12" height="30" rx="6" fill="#3046D9" />
            <path d="M0 10h12M0 20h12" stroke="#fff" strokeWidth="2" />
          </svg>
          <span>Chile Abierto</span>
        </Link>
        <nav aria-label="Secciones" className="hdr-nav">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={current === n.href ? "page" : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
        <Link href="/fuentes" className={`hdr-chip${demo ? "" : " ok"}`} title="Cómo verificamos cada dato">
          {demo ? `${official} datos oficiales · con ejemplos` : `${facts.length} datos verificados`}
        </Link>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="site">
      <span>Fuentes: DIPRES, Cámara de Diputadas y Diputados, Senado, BCN, Servel, ChileCompra, Consejo para la Transparencia, Banco Central, INE.</span>
      <span style={{ display: "flex", gap: 16 }}>
        <Link href="/fuentes">Cómo verificamos</Link>
        <a href="/api/facts">Datos abiertos (JSON)</a>
      </span>
    </footer>
  );
}
