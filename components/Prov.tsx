import type { ProvInfo } from "@/lib/provenance/view";
import { STATUS_HELP, STATUS_LABEL } from "@/lib/format";

/**
 * Verification badge. Every number on screen sits next to one. Built on <details> so it works without JavaScript
 * and with the keyboard; opening it shows sources, how each was verified and every check that ran.
 */
export function Prov({ info, align = "left" }: { info: ProvInfo; align?: "left" | "right" }) {
  const passed = info.checks.filter((c) => c.passed).length;
  return (
    <details className={`prov prov-${info.status}${align === "right" ? " right" : ""}`}>
      <summary aria-label={`${STATUS_LABEL[info.status]}: ver fuentes de «${info.label}»`}>
        {info.status === "oficial" && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
            <path d="M5 12l5 5L20 7" />
          </svg>
        )}
        {STATUS_LABEL[info.status]}
      </summary>
      <div className="prov-pop" role="group" aria-label={`Fuentes de ${info.label}`}>
        <div>
          <h4>{info.label}</h4>
          <span className="bignum" style={{ fontSize: 22 }}>{info.value}</span>
        </div>
        <p className="small muted">{info.definition}</p>
        <p className="small">
          <strong>{STATUS_LABEL[info.status]}.</strong> {STATUS_HELP[info.status]} {info.reason}
        </p>
        {info.method && <p className="small muted">Cálculo: {info.method}.</p>}
        {info.sources.length > 0 && (
          <div>
            <h4>Fuentes</h4>
            <ul>
              {info.sources.map((s) => (
                <li key={s.url + s.name}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a>
                  {s.official ? "" : " (prensa)"}: {s.title}
                  {s.locator ? `, ${s.locator}` : ""}. <span className="muted">Consultado el {s.retrieved}, {s.how}.</span>
                  {s.sha256 && <div className="hash">sha256 {s.sha256}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {info.checks.length > 0 && (
          <div>
            <h4>
              Comprobaciones: {passed} de {info.checks.length}
            </h4>
            <ul>
              {info.checks.map((c, i) => (
                <li key={i} className={c.passed ? "check-ok" : "check-bad"}>
                  {c.passed ? "✓" : "✗"} {c.description}
                  {c.detail && <div className="muted tiny">{c.detail}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}
        <a href={`/fuentes#${info.id}`} className="small">Ver en el registro de fuentes</a>
      </div>
    </details>
  );
}
