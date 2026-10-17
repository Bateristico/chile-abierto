/** Facts the pages render directly. If any of these is "pendiente", the build fails instead of showing a gap. */
export const REQUIRED_FACTS = [
  "gc.gasto_total_2027",
  "gc.crecimiento_real_2027",
  "gc.meta_deficit_estructural_2027",
  "gc.por_persona_dia",
  "poblacion.2026",
  "ppto2027.partidas_total",
  "deuda.autorizacion_2027",
  "deuda.limite_vigente_2026",
  "tramite.presentacion",
  "tramite.cuenta_camara",
  "tramite.plazo_fecha",
];
