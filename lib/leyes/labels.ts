/** Labels shared by server pages and browser explorers (no file access here). */
export type Profundidad = "simbolica" | "ajuste" | "sectorial" | "estructural";

export const PROFUNDIDAD: Record<Profundidad, { label: string; nivel: number; que: string }> = {
  simbolica: { label: "Simbólica", nivel: 1, que: "Reconoce o nombra; no cambia derechos, dinero ni instituciones." },
  ajuste: { label: "Ajuste", nivel: 2, que: "Corrige o actualiza una regla que ya existe." },
  sectorial: { label: "Reforma sectorial", nivel: 3, que: "Cambia cómo funciona un sector." },
  estructural: { label: "Estructural", nivel: 4, que: "Cambia un sistema completo o el diseño del Estado." },
};


export const DIAL = ["Mínimo", "Bajo", "Medio", "Alto", "Muy alto"] as const;
