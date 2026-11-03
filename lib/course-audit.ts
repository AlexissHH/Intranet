/**
 * Regla antifraude de ritmo de lectura de las cursadas (fuente única).
 *
 * Si un agente marca TODOS los módulos de un curso en pocos minutos, es casi seguro que no leyó
 * el material. La regla vale para TODOS los cursos (antes solo para los de 10 h o más) y el
 * mínimo esperable es proporcional a la duración lectiva (5 %), acotado entre 2 y 5 minutos:
 *
 *   duración   1 h → 3 min    2 h o más → 5 min    (≥ 10 h: 5 min, igual que antes)
 *
 * El intervalo medido es el tiempo entre el primer y el último módulo marcado. Un curso de un
 * solo módulo no tiene intervalo que medir (siempre es 0): queda siempre en revisión para que
 * Administración lo homologue a mano.
 *
 * Los umbrales son una decisión institucional: se ajustan solo con estas constantes.
 */

/** Porcentaje de la duración lectiva que se espera como mínimo entre primer y último módulo. */
export const MIN_READING_PACE_RATIO = 0.05;
/** Mínimo absoluto (minutos) para cualquier curso. */
export const MIN_READING_PACE_FLOOR_MINUTES = 2;
/** Tope (minutos): ningún curso exige más que esto para evitar la alerta. */
export const MIN_READING_PACE_CEILING_MINUTES = 5;

/** Minutos mínimos entre primer y último módulo para un curso de `durationHours` horas. */
export function getMinimumReadingMinutes(durationHours: number): number {
  const hours = Number(durationHours);
  const scaled = Number.isFinite(hours) && hours > 0 ? Math.round(hours * 60 * MIN_READING_PACE_RATIO) : 0;
  return Math.min(MIN_READING_PACE_CEILING_MINUTES, Math.max(MIN_READING_PACE_FLOOR_MINUTES, scaled));
}

/** TRUE si el ritmo de marcado no permite dar por leído el curso sin revisión. */
export function isSuspiciousReadingPace(input: {
  durationHours: number;
  timeDeltaMinutes: number;
}): boolean {
  const delta = Number(input.timeDeltaMinutes);
  return !Number.isFinite(delta) || delta < getMinimumReadingMinutes(input.durationHours);
}
