import { describe, expect, it } from "vitest";
import { dmy, etapasFrom, nextRefresh, parseCamaraAuthors, parseCamaraList, parseSenadoBill, statusOf } from "@/lib/connectors/leyes";
import { daysToLaw } from "@/lib/leyes/types";

// Shape of the Senado's tramitación service (trimmed from boletín 11179-13, the 40-hour week).
const SENADO = `<proyectos><proyecto>
  <descripcion>
    <boletin>11179-13</boletin>
    <titulo>Modifica el Código del Trabajo con el objeto de reducir la jornada laboral</titulo>
    <fecha_ingreso>08/03/2017</fecha_ingreso>
    <iniciativa>Moción</iniciativa>
    <camara_origen>C.Diputados</camara_origen>
    <urgencia_actual>Sin urgencia</urgencia_actual>
    <etapa>Tramitación terminada</etapa>
    <subetapa> /  </subetapa>
    <leynro>Ley N° 21.561</leynro>
    <diariooficial>26/04/2023</diariooficial>
    <estado>Publicado </estado>
    <refundidos/>
  </descripcion>
  <autores><autor><PARLAMENTARIO>Aguiló Melo, Sergio</PARLAMENTARIO></autor><autor><PARLAMENTARIO>Vallejo Dowling, Camila</PARLAMENTARIO></autor></autores>
  <tramitacion>
    <tramite><SESION>/</SESION><FECHA>08/03/2017</FECHA><DESCRIPCIONTRAMITE>Ingreso de proyecto .</DESCRIPCIONTRAMITE><ETAPDESCRIPCION>Primer trámite constitucional</ETAPDESCRIPCION><CAMARATRAMITE>C.Diputados</CAMARATRAMITE></tramite>
    <tramite><SESION>20/367</SESION><FECHA>24/10/2019</FECHA><DESCRIPCIONTRAMITE>Discusión general. Aprobado en general.</DESCRIPCIONTRAMITE><ETAPDESCRIPCION>Primer trámite constitucional</ETAPDESCRIPCION><CAMARATRAMITE>C.Diputados</CAMARATRAMITE></tramite>
    <tramite><SESION>3/371</SESION><FECHA>21/03/2023</FECHA><DESCRIPCIONTRAMITE>Discusión general. Aprobado en general.</DESCRIPCIONTRAMITE><ETAPDESCRIPCION>Segundo trámite constitucional</ETAPDESCRIPCION><CAMARATRAMITE>Senado</CAMARATRAMITE></tramite>
    <tramite><SESION>/</SESION><FECHA>11/04/2023</FECHA><DESCRIPCIONTRAMITE>Oficio al Tribunal Constitucional.</DESCRIPCIONTRAMITE><ETAPDESCRIPCION>Tercer trámite constitucional</ETAPDESCRIPCION><CAMARATRAMITE>C.Diputados</CAMARATRAMITE></tramite>
  </tramitacion>
  <votaciones/>
  <urgencias>
    <urgencia><TIPO>Suma</TIPO><FECHAINGRESO>30/08/2022</FECHAINGRESO><MENSAJEINGRESO>508-370</MENSAJEINGRESO><CAMARAINGRESO>Senado</CAMARAINGRESO><FECHARETIRO>14/09/2022</FECHARETIRO></urgencia>
    <urgencia><TIPO>Discusión inmediata</TIPO><FECHAINGRESO>04/04/2023</FECHAINGRESO><FECHARETIRO/></urgencia>
  </urgencias>
  <materias><materia><DESCRIPCION>JORNADA DE TRABAJO</DESCRIPCION></materia></materias>
</proyecto></proyectos>`;

describe("Senado tramitación parser", () => {
  const b = parseSenadoBill(SENADO)!;
  it("reads the bill's identity, status and law", () => {
    expect(b.b).toBe("11179-13");
    expect(b.iniciativa).toBe("Moción");
    expect(b.origen).toBe("C");
    expect(b.ingreso).toBe("2017-03-08");
    expect(b.st).toBe("ley");
    expect(b.ley).toBe("21.561");
    expect(b.publicada).toBe("2023-04-26");
    expect(daysToLaw({ ...b, autores: [] })).toBe(2240);
  });
  it("builds stages from the event log and flags weight signals", () => {
    expect(b.etapas.map((e) => [e.etapa, e.desde, e.hasta])).toEqual([
      ["Primer trámite constitucional", "2017-03-08", "2023-03-21"],
      ["Segundo trámite constitucional", "2023-03-21", "2023-04-11"],
      ["Tercer trámite constitucional", "2023-04-11", "2023-04-11"],
    ]);
    expect(b.señales).toContain("Control del Tribunal Constitucional");
    expect(b.urgencias).toEqual([
      { tipo: "Suma", desde: "2022-08-30", hasta: "2022-09-14" },
      { tipo: "Discusión inmediata", desde: "2023-04-04", hasta: undefined },
    ]);
    expect(b.autoresNombres).toHaveLength(2);
    expect(b.materias).toEqual(["JORNADA DE TRABAJO"]);
  });
  it("returns null when the service has no record", () => {
    expect(parseSenadoBill("<proyectos/>")).toBeNull();
  });
  it("maps statuses and dates", () => {
    expect(statusOf("En tramitación")).toBe("tramite");
    expect(statusOf("Archivado")).toBe("archivado");
    expect(dmy("1/9/2026")).toBe("2026-09-01");
    expect(etapasFrom([])).toEqual([]);
  });
  it("never re-reads a finished bill and re-reads urgent ones tomorrow", () => {
    expect(nextRefresh(b, "2026-10-18")).toBe("9999-12-31");
    expect(nextRefresh({ ...b, st: "tramite", urgenciaActual: "Suma" }, "2026-10-18")).toBe("2026-10-19");
    const n = nextRefresh({ ...b, st: "tramite", urgenciaActual: "Sin urgencia" }, "2026-10-18");
    expect(n >= "2026-10-21" && n <= "2026-10-27").toBe(true);
  });
});

describe("Cámara bill services", () => {
  it("reads the yearly list", () => {
    const xml = `<?xml version="1.0"?><ProyectosLeyColeccion xmlns="http://opendata.camara.cl/camaradiputados/v1"><ProyectoLey><Id>19006</Id><NumeroBoletin>18327-07</NumeroBoletin><Nombre>Modifica la ley N° 18.918</Nombre><FechaIngreso>2026-06-04T00:00:00</FechaIngreso><TipoIniciativa Valor="2">Moción</TipoIniciativa><CamaraOrigen Valor="1">Cámara de Diputados</CamaraOrigen></ProyectoLey><ProyectoLey><Id>18778</Id><NumeroBoletin>18115-27</NumeroBoletin><Nombre>Regula la residencia</Nombre><FechaIngreso>2026-03-06T00:00:00</FechaIngreso><TipoIniciativa Valor="1">Mensaje</TipoIniciativa><CamaraOrigen Valor="2">Senado</CamaraOrigen></ProyectoLey></ProyectosLeyColeccion>`;
    expect(parseCamaraList(xml)).toEqual([
      { camaraId: 19006, b: "18327-07", nombre: "Modifica la ley N° 18.918", ingreso: "2026-06-04", iniciativa: "Moción", origen: "C" },
      { camaraId: 18778, b: "18115-27", nombre: "Regula la residencia", ingreso: "2026-03-06", iniciativa: "Mensaje", origen: "S" },
    ]);
  });
  it("reads deputy ids among the authors", () => {
    const xml = `<ProyectoLey xmlns="http://opendata.camara.cl/camaradiputados/v1"><Autores><ParlamentarioAutor><Orden>0</Orden><Diputado><Id>956</Id><Nombre>Guillermo</Nombre></Diputado></ParlamentarioAutor><ParlamentarioAutor><Orden>0</Orden><Diputado><Id>1006</Id></Diputado></ParlamentarioAutor></Autores></ProyectoLey>`;
    expect(parseCamaraAuthors(xml)).toEqual([956, 1006]);
  });
});

import { dial, ruleFor } from "@/lib/leyes/clasificacion";
describe("law depth rules and impact dial", () => {
  it("decides the clear symbolic cases and the budget law by rule", () => {
    expect(ruleFor({ titulo: "Declara el día nacional de la cueca" })?.profundidad).toBe("simbolica");
    expect(ruleFor({ titulo: "Autoriza erigir un monumento en memoria de Gabriela Mistral" })?.profundidad).toBe("simbolica");
    expect(ruleFor({ titulo: "Concede, por especial gracia, la nacionalidad chilena a X" })?.profundidad).toBe("simbolica");
    expect(ruleFor({ titulo: "Ley de Presupuestos del Sector Público correspondiente al año 2026" })?.profundidad).toBe("estructural");
    expect(ruleFor({ titulo: "Ley de Presupuestos para el Sector Público correspondiente al año 2027" })?.profundidad).toBe("estructural");
    expect(ruleFor({ titulo: "Modifica el Código del Trabajo con el objeto de reducir la jornada laboral" })).toBeNull();
  });
  it("needs at least two known parts to show a dial", () => {
    expect(dial({ profundidad: "ajuste", razon: "x", por: "ia", partes: { alcance: "desconocido", permanencia: "desconocido", derechos: "desconocido", instituciones: "ajusta" } })).toBeNull();
    expect(dial({ profundidad: "estructural", razon: "x", por: "ia", partes: { alcance: "amplio", permanencia: "permanente", derechos: "crea", instituciones: "crea" } })?.nivel).toBe(5);
    expect(dial(ruleFor({ titulo: "Declara el día nacional de la cueca" })!)?.nivel).toBeLessThanOrEqual(3);
  });
});
