import type { SourceKind } from "./types";

export interface Publisher {
  id: string;
  name: string;
  kind: SourceKind;
  /** Hostnames this publisher legitimately serves from. A source URL outside them fails the domain check. */
  domains: string[];
  /** Publishers that share an owner are not independent for corroboration purposes. */
  group?: string;
  homepage: string;
}

/**
 * Registry of publishers. "oficial" means a Chilean State body publishing its own data.
 * Adding a publisher here is a reviewed change: it is what the domain check trusts.
 */
export const PUBLISHERS: Publisher[] = [
  { id: "dipres", name: "Dirección de Presupuestos (DIPRES)", kind: "oficial", domains: ["dipres.gob.cl", "www.dipres.gob.cl"], homepage: "https://www.dipres.gob.cl" },
  { id: "presupuestoabierto", name: "Presupuesto Abierto (Hacienda)", kind: "oficial", domains: ["presupuestoabierto.gob.cl", "api.presupuestoabierto.gob.cl"], homepage: "https://presupuestoabierto.gob.cl" },
  { id: "datosgob", name: "Portal de Datos Abiertos del Estado", kind: "oficial", domains: ["datos.gob.cl"], homepage: "https://datos.gob.cl" },
  { id: "camara", name: "Cámara de Diputadas y Diputados", kind: "oficial", domains: ["camara.cl", "www.camara.cl", "opendata.camara.cl"], homepage: "https://www.camara.cl" },
  { id: "senado", name: "Senado de Chile", kind: "oficial", domains: ["senado.cl", "www.senado.cl", "tramitacion.senado.cl"], homepage: "https://www.senado.cl" },
  { id: "bcn", name: "Biblioteca del Congreso Nacional", kind: "oficial", domains: ["bcn.cl", "www.bcn.cl", "datos.bcn.cl", "www.leychile.cl"], homepage: "https://www.bcn.cl" },
  { id: "servel", name: "Servicio Electoral (Servel)", kind: "oficial", domains: ["servel.cl", "www.servel.cl"], homepage: "https://www.servel.cl" },
  { id: "chilecompra", name: "ChileCompra (Mercado Público)", kind: "oficial", domains: ["chilecompra.cl", "www.chilecompra.cl", "api.mercadopublico.cl", "www.mercadopublico.cl"], homepage: "https://www.chilecompra.cl" },
  { id: "cplt", name: "Consejo para la Transparencia (InfoLobby, InfoProbidad)", kind: "oficial", domains: ["cplt.cl", "www.consejotransparencia.cl", "www.infolobby.cl", "www.infoprobidad.cl"], homepage: "https://www.consejotransparencia.cl" },
  { id: "bcch", name: "Banco Central de Chile", kind: "oficial", domains: ["si3.bcentral.cl", "www.bcentral.cl"], homepage: "https://www.bcentral.cl" },
  { id: "ine", name: "Instituto Nacional de Estadísticas (INE)", kind: "oficial", domains: ["ine.gob.cl", "www.ine.gob.cl"], homepage: "https://www.ine.gob.cl" },
  { id: "contraloria", name: "Contraloría General de la República", kind: "oficial", domains: ["contraloria.cl", "www.contraloria.cl"], homepage: "https://www.contraloria.cl" },
  // Press: allowed as secondary/corroborating sources only.
  { id: "emol", name: "Emol (El Mercurio)", kind: "prensa", group: "el-mercurio", domains: ["www.emol.com", "emol.com"], homepage: "https://www.emol.com" },
  { id: "cnnchile", name: "CNN Chile", kind: "prensa", group: "vtr-cnn", domains: ["www.cnnchile.com", "cnnchile.com"], homepage: "https://www.cnnchile.com" },
  { id: "exante", name: "Ex-Ante", kind: "prensa", group: "ex-ante", domains: ["www.ex-ante.cl", "ex-ante.cl"], homepage: "https://www.ex-ante.cl" },
  { id: "latercera", name: "La Tercera", kind: "prensa", group: "copesa", domains: ["www.latercera.com"], homepage: "https://www.latercera.com" },
  { id: "df", name: "Diario Financiero", kind: "prensa", group: "df", domains: ["www.df.cl", "df.cl"], homepage: "https://www.df.cl" },
];

export function getPublisher(id: string): Publisher | undefined {
  return PUBLISHERS.find((p) => p.id === id);
}

export function isOfficial(id: string): boolean {
  return getPublisher(id)?.kind === "oficial";
}
