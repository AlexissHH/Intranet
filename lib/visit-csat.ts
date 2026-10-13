/**
 * Encuestas de satisfacción (CSAT) para visitas escolares.
 *
 * Flujo:
 *  1. El administrador envía, desde la ficha de la actividad, un email (Gmail del sistema)
 *     con un LINK A LA ENCUESTA pública: /encuesta/{token} — un token único por visita.
 *  2. La página pública (app/encuesta) registra la calificación en Firestore como documento
 *     `visit_csat/{token}` (creación anónima, una sola vez — control estricto por reglas).
 *  3. La ficha de la actividad muestra el resumen: cantidad de respuestas y promedio.
 *
 * Seguridad: el token es indistinguible de un UUID con prefijo; las reglas solo permiten
 * CREAR (no leer ni modificar) estos documentos anónimos, validando campos y rangos.
 */
import { doc, setDoc } from 'firebase/firestore';
import { generateId } from './utils';
import { ensureFirestoreReady, VISIT_CSAT_COLLECTION } from './firestore';

export interface VisitCsatDoc {
  /** Token único de la encuesta (es el ID del documento). */
  id: string;
  /** Id de la actividad de la agenda (para vincular respuestas). */
  activityId: string;
  /** Puntaje 1..5 (5 = muy satisfecho). */
  rating: number;
  /** Comentario opcional (máx. 500 caracteres). */
  comment: string;
  /** Fecha de envío (ISO). */
  submittedAt: string;
}

/** Máximo de caracteres del comentario, espejado en firestore.rules. */
export const CSAT_COMMENT_MAX_CHARS = 500;

/** Crea un token nuevo: formato csat-<stamp36>-<uuid> (lo valida también firestore.rules). */
export function createCsatToken(): string {
  return generateId('csat');
}

/** URL pública de la encuesta: token + identificadores de display (título/fecha/actividad). */
export function buildCsatSurveyUrl(options: {
  token: string;
  activityId: string;
  title: string;
  date: string;
  origin: string;
}): string {
  const { token, activityId, title, date, origin } = options;
  const base = (origin || '').replace(/\/+$/, '');
  const params = new URLSearchParams();
  if (title) params.set('a', title);
  if (date) params.set('d', date);
  if (activityId) params.set('ai', activityId);
  const query = params.toString() ? `?${params.toString()}` : '';
  return `${base}/encuesta/${encodeURIComponent(token)}${query}`;
}

/** Token válido según el formato que generamos (evita basura en Firestore desde la pág. pública). */
export function isCsatTokenFormatValid(token: string): boolean {
  return /^csat-[0-9a-z-]{16,90}$/.test(token);
}

/**
 * Registra la calificación en Firestore. Sin sesión (público): la creación anónima la
 * controla firestore.rules sobre visitas de una sola vez.
 * 'already' => la encuesta fue respondida antes (o las reglas bloquearon la creación).
 */
export async function saveCsatSurvey(
  survey: Omit<VisitCsatDoc, 'id'> & { id: string }
): Promise<'ok' | 'already' | 'error'> {
  const database = await ensureFirestoreReady();
  if (!database) return 'error';
  try {
    await setDoc(doc(database, VISIT_CSAT_COLLECTION, survey.id), {
      activityId: survey.activityId,
      rating: survey.rating,
      comment: survey.comment,
      submittedAt: survey.submittedAt,
    });
    return 'ok';
  } catch (e) {
    if ((e as { code?: string })?.code === 'permission-denied') return 'already';
    console.error('No se pudo guardar la encuesta de satisfacción:', e);
    return 'error';
  }
}

/** Promedio del puntaje de un conjunto de respuestas (null si no hay datos). */
export function csatAverage(resultDocs: { rating: number }[]): number | null {
  if (resultDocs.length === 0) return null;
  const sum = resultDocs.reduce((acc, d) => acc + (Number(d.rating) || 0), 0);
  return Math.round((sum / resultDocs.length) * 10) / 10;
}
