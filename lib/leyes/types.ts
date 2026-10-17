/**
 * Bills and laws: one record per boletín, from the Senado's public tramitación service (both chambers) and the
 * Cámara's bill service (authors with deputy ids). Dates are ISO (YYYY-MM-DD).
 */

export type BillStatus = "ley" | "tramite" | "archivado" | "retirado" | "rechazado" | "otro";

export interface Etapa {
  /** "Primer trámite constitucional", "Comisión Mixta…", "Trámite en Tribunal Constitucional"… */
  etapa: string;
  /** "C.Diputados" | "Senado" | "" */
  camara: string;
  desde: string;
  hasta: string;
}

export interface Urgencia {
  /** "Simple" | "Suma" | "Discusión inmediata" */
  tipo: string;
  desde: string;
  hasta?: string;
}

export interface Bill {
  b: string;
  /** Cámara's internal bill id (for its links) */
  camaraId?: number;
  titulo: string;
  iniciativa: "Mensaje" | "Moción" | string;
  /** Chamber of origin */
  origen: "C" | "S";
  ingreso: string;
  etapa: string;
  estado: string;
  st: BillStatus;
  ley?: string;
  /** Publication in the Diario Oficial */
  publicada?: string;
  urgenciaActual?: string;
  urgencias: Urgencia[];
  etapas: Etapa[];
  /** Last movement */
  ultimo?: { fecha: string; descripcion: string };
  materias: string[];
  /** Deputy ids (Cámara) of the authors of a Moción */
  autores: number[];
  /** Authors' names as the Senado lists them (senators, or deputies without an id) */
  autoresNombres: string[];
  refundidos: string[];
  /** Total number of procedural events: a rough measure of how much the bill was worked on */
  movimientos: number;
  /** Stage events that signal weight: Comisión Mixta, Tribunal Constitucional control, veto (observaciones) */
  señales: string[];
}

export interface LeyesData {
  generadoEl: string;
  /** Bills filed since this date are in scope (plus older bills voted in the Cámara since then) */
  desde: string;
  bills: Bill[];
  /** Bills in scope not read yet (the first captures fill the series over several days) */
  sinLeer?: number;
}

export const SENADO_BILL_URL = (b: string) => `https://tramitacion.senado.cl/appsenado/templates/tramitacion/index.php?boletin_ini=${encodeURIComponent(b)}`;
export const CAMARA_BILL_URL = (b: string, id?: number) => `https://www.camara.cl/legislacion/ProyectosDeLey/tramitacion.aspx?${id ? `prmID=${id}&` : ""}prmBOLETIN=${encodeURIComponent(b)}`;

export const DAY = 86_400_000;
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

/** Days from filing to publication, for published laws. */
export function daysToLaw(b: Bill): number | null {
  return b.st === "ley" && b.publicada ? daysBetween(b.ingreso, b.publicada) : null;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export const STATUS_LABEL: Record<BillStatus, string> = {
  ley: "Ley publicada",
  tramite: "En tramitación",
  archivado: "Archivado",
  retirado: "Retirado",
  rechazado: "Rechazado",
  otro: "Otro",
};
