/**
 * Métricas de gestión de la Intranet (agentes formados, visitas realizadas, CSAT).
 *
 * Fuente ÚNICA de verdad: la portada (HomeSection) y el panel de Administración usan estas
 * mismas funciones, de modo que ambos muestran siempre el mismo número. Son funciones puras
 * (reciben `now` para poder probarlas) y no leen localStorage ni Firestore.
 *
 * Reglas (solo cuenta lo que realmente ocurrió):
 *  - AGENTE FORMADO: persona (email, o uid en los resultados publicados) que completó el 100 % de los módulos de un curso de
 *    Capacitación Y dejó su calificación CSAT. Las cursadas "en progreso", con alerta de
 *    lectura simultánea u observadas por Administración NO cuentan hasta ser homologadas.
 *    Una misma persona se cuenta una sola vez por período, aunque complete varios cursos.
 *    El período se decide por el momento en que quedó formado (el último de: último módulo
 *    marcado o reseña CSAT), en la zona horaria institucional.
 *  - Los asistentes cargados en la agenda son una cantidad ESTIMADA al programar: NO se usan
 *    para "agentes formados".
 *  - VISITA REALIZADA: visita de la agenda ya finalizada (estado efectivo `finalizada`). Las
 *    pendientes, canceladas, futuras o en curso no cuentan como realizadas.
 *  - ALUMNOS RECIBIDOS: solo la asistencia REAL (`attendeesActual`) cargada por Administración
 *    en visitas realizadas. La cantidad del agendado (`attendeesCount`) es una estimación y
 *    no se suma; las visitas realizadas sin asistencia cargada se informan aparte.
 *  - Los registros de ejemplo (`isSample`) nunca cuentan.
 */
import type { ActivityItem, AgentCourseAudit, TrainingResult } from './mock-data';
import { INSTITUTIONAL_TIMEZONE, getInstitutionalTodayParts } from './utils';
import { isSuspiciousReadingPace } from './course-audit';

export type MetricPeriod = 'anual' | 'mensual';

export interface MetricPeriodRef {
  isMensual: boolean;
  /** Año en la zona horaria institucional. */
  year: number;
  /** Mes 0-11 en la zona horaria institucional. */
  monthIndex: number;
}

export function getMetricPeriodRef(period: MetricPeriod | undefined, now: Date = new Date()): MetricPeriodRef {
  const { year, month } = getInstitutionalTodayParts(now);
  return { isMensual: period === 'mensual', year, monthIndex: month };
}

/** `ymd` = "YYYY-MM-DD" (fecha de negocio de la agenda). */
export function isYmdInPeriod(ymd: string | undefined, ref: MetricPeriodRef): boolean {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(ymd || '');
  if (!match) return false;
  if (Number(match[1]) !== ref.year) return false;
  return !ref.isMensual || Number(match[2]) - 1 === ref.monthIndex;
}

/** `ts` = milisegundos desde epoch; se evalúa en la zona horaria institucional. */
export function isTimestampInPeriod(ts: number | undefined, ref: MetricPeriodRef): boolean {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return false;
  const { year, month } = getInstitutionalTodayParts(new Date(ts));
  if (year !== ref.year) return false;
  return !ref.isMensual || month === ref.monthIndex;
}

/* ───────────────────────────── Agenda ───────────────────────────── */

/** Ahora mismo en la zona institucional: fecha YYYY-MM-DD y hora HH:mm (comparables como texto). */
export function getInstitutionalNowStamp(now: Date = new Date()): { ymd: string; hhmm: string } {
  const { year, month, day } = getInstitutionalTodayParts(now);
  const ymd = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const hhmm = new Intl.DateTimeFormat('es-AR', {
    timeZone: INSTITUTIONAL_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
  return { ymd, hhmm };
}

/**
 * Estado ELEMENTAL para mostrar: los estados gestionados a mano (pendiente/cancelada/
 * finalizada/en_curso) mandan; si la actividad está "confirmada", el estado se DERIVA de
 * los horarios reales: en curso dentro del rango, finalizada al pasar la hora de fin
 * (o el día anterior entero). Es solo visual: no cambia el estado persistido.
 */
export function getEffectiveActivityStatus(act: ActivityItem, now: Date = new Date()): string {
  const base = act.status || '';
  if (base !== 'confirmada') return base;
  const start = act.startTime || '';
  const end = act.endTime || '';
  const { ymd, hhmm } = getInstitutionalNowStamp(now);
  if (act.date && act.date < ymd) return 'finalizada';
  if (act.date === ymd && start && end) {
    if (hhmm >= start && hhmm < end) return 'en_curso';
    if (hhmm >= end) return 'finalizada';
  }
  return base;
}

export interface VisitMetrics {
  /** Visitas ya finalizadas dentro del período (las únicas que cuentan como realizadas). */
  realizadas: number;
  /** Visitas confirmadas o en curso que todavía no terminaron. */
  porRealizar: number;
  pendientes: number;
  canceladas: number;
  /** Suma de la asistencia REAL cargada en las visitas realizadas. */
  alumnosRecibidos: number;
  /** Visitas realizadas a las que todavía no se les cargó la asistencia real. */
  sinAsistenciaCargada: number;
}

/** Asistencia real de una actividad, o `undefined` si todavía no fue cargada. */
export function getActualAttendees(act: ActivityItem): number | undefined {
  const n = act.attendeesActual;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
}

export function computeVisitMetrics(
  activities: ActivityItem[],
  period: MetricPeriod | MetricPeriodRef | undefined,
  now: Date = new Date()
): VisitMetrics {
  const ref = typeof period === 'object' && period !== null ? period : getMetricPeriodRef(period, now);
  const result: VisitMetrics = {
    realizadas: 0,
    porRealizar: 0,
    pendientes: 0,
    canceladas: 0,
    alumnosRecibidos: 0,
    sinAsistenciaCargada: 0,
  };
  for (const act of activities) {
    if (act.type !== 'visita' || !isYmdInPeriod(act.date, ref)) continue;
    const status = getEffectiveActivityStatus(act, now);
    if (status === 'finalizada') {
      result.realizadas += 1;
      const actual = getActualAttendees(act);
      if (actual === undefined) result.sinAsistenciaCargada += 1;
      else result.alumnosRecibidos += actual;
    } else if (status === 'confirmada' || status === 'en_curso') {
      result.porRealizar += 1;
    } else if (status === 'pendiente') {
      result.pendientes += 1;
    } else if (status === 'cancelada') {
      result.canceladas += 1;
    }
  }
  return result;
}

/* ─────────────────────── Capacitación (cursadas) ─────────────────────── */

/** El agente marcó el 100 % de los módulos del curso. */
export function isCourseAuditCompleted(a: AgentCourseAudit): boolean {
  return a.isFullyCompleted === true && a.completedModulesCount >= a.totalModules;
}

/** Una calificación CSAT es válida solo si viene de una cursada completa y no es de ejemplo. */
export function isCsatCountable(a: AgentCourseAudit): boolean {
  return !a.isSample && Boolean(a.csatRating) && isCourseAuditCompleted(a);
}

/**
 * Cursada que acredita a un agente como formado: completa al 100 %, con reseña CSAT, y sin
 * marcas de auditoría pendientes (`consistente`) o ya homologada por Administración.
 * Quedan fuera `en_progreso`, `alerta_simultanea` (hasta que se homologue) y `observado`.
 */
export function isAuditFormado(a: AgentCourseAudit): boolean {
  if (a.isSample) return false;
  if (!isCourseAuditCompleted(a) || !a.csatRating) return false;
  if (a.auditStatus === 'aprobado_admin') return true;
  // Una cursada guardada como "consistente" antes de la regla de ritmo de lectura de lib/course-audit.ts
  // se vuelve a evaluar acá: si hoy sería sospechosa, espera la homologación de Administración.
  return a.auditStatus === 'consistente' && !isSuspiciousReadingPace(a);
}

/**
 * Momento (epoch ms) en que la cursada quedó cerrada: el último entre el último módulo marcado
 * y la reseña CSAT. Sin marca de último módulo no se puede ubicar en un período (undefined).
 */
export function getAuditClosedAt(a: AgentCourseAudit): number | undefined {
  const lastCheck = a.lastCheckTimestamp;
  if (typeof lastCheck !== 'number' || !Number.isFinite(lastCheck)) return undefined;
  const csatAt = a.csatSubmittedAt;
  return typeof csatAt === 'number' && Number.isFinite(csatAt) ? Math.max(lastCheck, csatAt) : lastCheck;
}

/**
 * Resultado anónimo de una cursada terminada (completa, con reseña CSAT, real y con marca de tiempo), o null
 * si todavía no corresponde publicarlo. `personKey` identifica a la persona sin exponer su email: para
 * publicar se pasa el uid del agente; sin él (cálculo local de Administración) se usa su email normalizado,
 * que nunca sale del navegador.
 */
export function auditToResult(a: AgentCourseAudit, personKey?: string): TrainingResult | null {
  if (a.isSample || !isCourseAuditCompleted(a) || !a.csatRating) return null;
  const closedAt = getAuditClosedAt(a);
  if (closedAt === undefined) return null;
  const key = (personKey || '').trim() || (a.agentEmail || '').trim().toLowerCase() || a.id;
  return { id: a.id, courseId: a.courseId, personKey: key, closedAt, csatRating: a.csatRating, formado: isAuditFormado(a) };
}

/** Resultados de una lista de cursadas (se usa el uid del agente si la cursada lo tiene). */
export function auditsToResults(audits: AgentCourseAudit[]): TrainingResult[] {
  // Una cursada anterior a `agentUid` usa el uid que la misma persona (mismo email) tenga en otra cursada: así
  // no cuenta como dos personas distintas.
  const uidByEmail = new Map<string, string>();
  for (const a of audits) {
    const email = (a.agentEmail || '').trim().toLowerCase();
    if (email && a.agentUid && !uidByEmail.has(email)) uidByEmail.set(email, a.agentUid);
  }
  const out: TrainingResult[] = [];
  for (const a of audits) {
    const r = auditToResult(a, a.agentUid || uidByEmail.get((a.agentEmail || '').trim().toLowerCase()));
    if (r) out.push(r);
  }
  return out;
}

export interface TrainingMetrics {
  /** Personas distintas con al menos un curso acreditado en el período. */
  agentesFormados: number;
  /** Cursos acreditados en el período (una persona puede sumar varios). */
  cursosCompletados: number;
}

export function computeTrainingMetrics(
  results: TrainingResult[],
  period: MetricPeriod | MetricPeriodRef | undefined,
  now: Date = new Date()
): TrainingMetrics {
  const ref = typeof period === 'object' && period !== null ? period : getMetricPeriodRef(period, now);
  const agents = new Set<string>();
  let cursosCompletados = 0;
  for (const result of results) {
    if (!result.formado) continue;
    // Sin marca de tiempo no se puede ubicar en un período: no se cuenta (nunca se asume "hoy").
    if (!isTimestampInPeriod(result.closedAt, ref)) continue;
    cursosCompletados += 1;
    agents.add(result.personKey || result.id);
  }
  return { agentesFormados: agents.size, cursosCompletados };
}

export interface CsatIndex {
  /** false cuando todavía no hay reseñas: la UI debe mostrar "sin datos". */
  hasData: boolean;
  csatPercentage: number;
  totalEvaluations: number;
  averageRating5: number;
}

const CSAT_SCORE: Record<TrainingResult['csatRating'], number> = {
  'Muy Satisfecho': 5,
  Satisfecho: 4,
  Neutral: 3,
  Insatisfecho: 2,
};

/**
 * Índice CSAT de las cursadas (porcentaje de reseñas positivas y promedio sobre 5) calculado con los
 * resultados anónimos. Mismo criterio que `getCourseCsatStats` de lib/storage.ts, sin comentarios ni nombres.
 */
export function computeCsatIndex(results: TrainingResult[], filter?: (r: TrainingResult) => boolean): CsatIndex {
  const rated = results.filter((r) => r.csatRating in CSAT_SCORE && (!filter || filter(r)));
  if (rated.length === 0) return { hasData: false, csatPercentage: 0, totalEvaluations: 0, averageRating5: 0 };
  const positive = rated.filter((r) => r.csatRating === 'Muy Satisfecho' || r.csatRating === 'Satisfecho').length;
  const scoreSum = rated.reduce((acc, r) => acc + CSAT_SCORE[r.csatRating], 0);
  return {
    hasData: true,
    csatPercentage: Math.round((positive / rated.length) * 100),
    totalEvaluations: rated.length,
    averageRating5: Number((scoreSum / rated.length).toFixed(1)),
  };
}
