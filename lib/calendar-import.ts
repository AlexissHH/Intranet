/**
 * Importación puntual de eventos de Google Calendar a la agenda de la intranet.
 *
 * Este módulo solo transforma datos (sin red ni almacenamiento): convierte eventos de Calendar en BORRADORES
 * que el administrador revisa y completa en una vista previa; recién al confirmar se guardan como actividades
 * (ver `draftToActivity`). Todo lo que Calendar no trae (escuela, nivel, alumnos, contacto) queda vacío para
 * completarlo a mano: no se inventa ningún dato.
 */
import type { ActivityItem } from './mock-data';
import type { GoogleCalendarEvent } from './workspace';
import { generateId, getInstitutionalDateTimeParts } from './utils';

export type ImportActivityType = ActivityItem['type'];

export const IMPORT_TYPE_LABELS: Record<ImportActivityType, string> = {
  visita: 'Visita escolar',
  capacitacion: 'Capacitación',
  reunion: 'Reunión',
  evento: 'Evento',
};

/** Borrador editable de una actividad que viene de un evento de Calendar (los números van como texto). */
export interface CalendarImportDraft {
  /** Id del evento de Google Calendar. */
  calendarEventId: string;
  type: ImportActivityType;
  /** true si el tipo se dedujo de palabras del título o la descripción; false si es el valor por defecto. */
  typeRecognized: boolean;
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm (vacío si el evento es de todo el día)
  endTime: string; // HH:mm (vacío si no se pudo determinar)
  location: string;
  responsible: string;
  institution: string;
  level: string;
  attendeesCount: string;
  contactEmail: string;
  contactPhone: string;
  description: string;
  /** Avisos para el administrador (por ejemplo: evento de todo el día). */
  notices: string[];
}

export interface CalendarImportSkipped {
  /** Ya existen en la agenda (importados antes, creados desde la intranet o con mismo título, fecha y hora). */
  yaEnAgenda: number;
  /** Cumpleaños del equipo agendados desde la intranet. */
  cumpleanos: number;
  /** Eventos cancelados o de otro tipo de Calendar (ubicación de trabajo, ausencia, etc.). */
  otros: number;
}

export interface CalendarImportResult {
  drafts: CalendarImportDraft[];
  skipped: CalendarImportSkipped;
}

const MAX_DESCRIPTION_CHARS = 1500;

function normalizeForMatch(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Sugiere el tipo de actividad según palabras del título (y, si no alcanza, de la descripción).
 * Es solo una sugerencia: el administrador puede cambiarla en la vista previa.
 */
export function guessActivityType(title: string, description = ''): { type: ImportActivityType; recognized: boolean } {
  const rules: { type: ImportActivityType; pattern: RegExp }[] = [
    { type: 'visita', pattern: /\b(visitas?|escuelas?|colegios?|escolar(es)?|alumnos?|estudiantes?|primari[ao]s?|secundari[ao]s?|jardin(es)?)\b/ },
    { type: 'capacitacion', pattern: /\b(capacitacion(es)?|cursos?|talleres?|seminarios?|jornadas?|formacion|clases?|diplomaturas?)\b/ },
    { type: 'reunion', pattern: /\b(reunion(es)?|comision(es)?|coordinacion|mesa de trabajo)\b/ },
  ];
  for (const source of [normalizeForMatch(title), normalizeForMatch(description)]) {
    for (const rule of rules) {
      if (rule.pattern.test(source)) return { type: rule.type, recognized: true };
    }
  }
  return { type: 'evento', recognized: false };
}

/** Texto plano de una descripción de Calendar (que puede traer HTML), acotado en longitud. */
export function calendarTextToPlain(raw: string): string {
  const withBreaks = raw.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n');
  let text: string;
  if (typeof DOMParser !== 'undefined') {
    text = new DOMParser().parseFromString(withBreaks, 'text/html').body.textContent ?? '';
  } else {
    text = withBreaks.replace(/<[^>]*>/g, '');
  }
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text.length > MAX_DESCRIPTION_CHARS ? `${text.slice(0, MAX_DESCRIPTION_CHARS).trimEnd()}…` : text;
}

function isIntranetBirthday(event: GoogleCalendarEvent): boolean {
  return /^cumplea(ñ|n)os de /i.test((event.summary ?? '').trim());
}

function eventKey(date: string, startTime: string, title: string): string {
  return `${date}|${startTime}|${normalizeForMatch(title).replace(/\s+/g, ' ').trim()}`;
}

function toDraft(event: GoogleCalendarEvent): CalendarImportDraft | null {
  const title = (event.summary ?? '').trim();
  const description = calendarTextToPlain(event.description ?? '');
  const notices: string[] = [];

  let date = '';
  let startTime = '';
  let endTime = '';
  if (event.start?.dateTime) {
    const start = getInstitutionalDateTimeParts(event.start.dateTime);
    if (!start) return null;
    date = start.date;
    startTime = start.time;
    const end = event.end?.dateTime ? getInstitutionalDateTimeParts(event.end.dateTime) : null;
    if (end && end.date === start.date) {
      endTime = end.time;
    } else if (end) {
      notices.push('El evento dura más de un día: se importa el primer día. Indica la hora de fin.');
    }
  } else if (event.start?.date) {
    date = event.start.date;
    notices.push('Es un evento de todo el día: indica la hora de inicio y de fin.');
  } else {
    return null;
  }

  const guess = guessActivityType(title, description);
  if (!title) notices.push('El evento no tiene título: escríbelo antes de importar.');

  return {
    calendarEventId: event.id,
    type: guess.type,
    typeRecognized: guess.recognized,
    title,
    date,
    startTime,
    endTime,
    location: (event.location ?? '').trim(),
    responsible: '',
    institution: '',
    level: '',
    attendeesCount: '',
    contactEmail: '',
    contactPhone: '',
    description,
    notices,
  };
}

/**
 * Convierte los eventos de Calendar en borradores, dejando afuera lo que no corresponde importar y tomando
 * como máximo `limit`. Se omiten los eventos que ya están en la agenda (por id de evento, por id de actividad
 * o por mismo título, fecha y hora de inicio), los cumpleaños del equipo, los cancelados y los que no son
 * eventos comunes de Calendar.
 */
export function buildImportCandidates(
  events: GoogleCalendarEvent[],
  existing: ActivityItem[],
  limit: number
): CalendarImportResult {
  const knownEventIds = new Set(existing.map((a) => a.calendarEventId).filter((id): id is string => Boolean(id)));
  const knownActivityIds = new Set(existing.map((a) => a.id));
  const knownKeys = new Set(existing.map((a) => eventKey(a.date, a.startTime, a.title)));

  const skipped: CalendarImportSkipped = { yaEnAgenda: 0, cumpleanos: 0, otros: 0 };
  const drafts: CalendarImportDraft[] = [];

  for (const event of events) {
    if (drafts.length >= limit) break;
    if (event.status === 'cancelled' || (event.eventType && event.eventType !== 'default')) {
      skipped.otros += 1;
      continue;
    }
    const privateProps = event.extendedProperties?.private ?? {};
    if (isIntranetBirthday(event)) {
      skipped.cumpleanos += 1;
      continue;
    }
    if (
      knownEventIds.has(event.id) ||
      (privateProps.iclActivityId && knownActivityIds.has(privateProps.iclActivityId))
    ) {
      skipped.yaEnAgenda += 1;
      continue;
    }
    const draft = toDraft(event);
    if (!draft) {
      skipped.otros += 1;
      continue;
    }
    if (draft.startTime && knownKeys.has(eventKey(draft.date, draft.startTime, draft.title))) {
      skipped.yaEnAgenda += 1;
      continue;
    }
    drafts.push(draft);
  }
  return { drafts, skipped };
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const BASIC_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Problemas que impiden importar un borrador (lista vacía = listo para importar). */
export function validateDraft(draft: CalendarImportDraft): string[] {
  const problems: string[] = [];
  if (!draft.title.trim()) problems.push('Falta el título.');
  if (!YMD.test(draft.date) || Number.isNaN(new Date(`${draft.date}T12:00:00`).getTime())) {
    problems.push('La fecha no es válida.');
  }
  if (!HHMM.test(draft.startTime)) problems.push('Falta la hora de inicio.');
  if (!HHMM.test(draft.endTime)) problems.push('Falta la hora de fin.');
  else if (HHMM.test(draft.startTime) && draft.endTime <= draft.startTime) {
    problems.push('La hora de fin debe ser posterior a la de inicio.');
  }
  if (draft.attendeesCount.trim() && !(Number.parseInt(draft.attendeesCount, 10) > 0)) {
    problems.push('La cantidad de alumnos debe ser un número mayor a cero.');
  }
  if (draft.type === 'visita' && draft.contactEmail.trim() && !BASIC_EMAIL.test(draft.contactEmail.trim())) {
    problems.push('El email de contacto no es válido.');
  }
  return problems;
}

/**
 * Arma la actividad definitiva a partir de un borrador ya validado. Entra como PENDIENTE: no cuenta como
 * visita realizada hasta que Administración la confirme y, una vez hecha, cargue la asistencia real.
 */
export function draftToActivity(draft: CalendarImportDraft): ActivityItem {
  const isVisit = draft.type === 'visita';
  const estimated = Number.parseInt(draft.attendeesCount, 10);
  return {
    id: generateId(isVisit ? 'visita' : 'act'),
    title: draft.title.trim(),
    type: draft.type,
    date: draft.date,
    startTime: draft.startTime,
    endTime: draft.endTime,
    location: draft.location.trim() || 'A confirmar',
    responsible: draft.responsible.trim(),
    ...(estimated > 0 ? { attendeesCount: estimated } : {}),
    ...(isVisit && draft.institution.trim() ? { institution: draft.institution.trim() } : {}),
    ...(isVisit && draft.level.trim() ? { level: draft.level.trim() } : {}),
    ...(isVisit && draft.contactEmail.trim() ? { contactEmail: draft.contactEmail.trim() } : {}),
    ...(isVisit && draft.contactPhone.trim() ? { contactPhone: draft.contactPhone.trim() } : {}),
    description: draft.description.trim(),
    status: 'pendiente',
    calendarEventId: draft.calendarEventId,
  };
}
