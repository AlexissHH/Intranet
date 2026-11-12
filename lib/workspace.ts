/**
 * Google Workspace Client Integration
 * Handles interactions with Google Calendar, Google Sheets, and Gmail
 * using the client-side OAuth Bearer token.
 */

import { utf8ToBase64, utf8ToBase64Url, INSTITUTIONAL_TIMEZONE } from './utils';

export class WorkspaceAuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = 'WorkspaceAuthError';
    this.status = status;
  }
}

export interface CalendarEventPayload {
  summary: string;
  description?: string;
  location?: string;
  startDateTime?: string; // ISO 8601
  endDateTime?: string;   // ISO 8601
  startDate?: string;     // YYYY-MM-DD for all-day event
  endDate?: string;       // YYYY-MM-DD for all-day event
  recurrence?: string[];  // e.g. ['RRULE:FREQ=YEARLY']
  /** Id de la actividad de la intranet: queda en el evento para no volver a importarlo desde Calendar. */
  activityId?: string;
  /**
   * Correos de las cuentas que reciben el evento en su propio calendario. Se validan y se deduplican acá;
   * Google NO les envía email (`sendUpdates=none`) y entre invitados no se ven los correos.
   */
  attendees?: string[];
}

/** Tope de invitados por evento que se envía a Google (el límite de Calendar es mayor). */
export const MAX_CALENDAR_ATTENDEES = 200;

/** El evento ya no existe en el calendario consultado (404/410): se borró o está en el calendario de otra cuenta. */
export class WorkspaceNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceNotFoundError';
  }
}

export interface SendEmailPayload {
  to: string;
  subject: string;
  body: string;
  from?: string;
  senderName?: string;
}

export interface SheetRowPayload {
  spreadsheetId: string;
  range?: string;
  values: (string | number)[];
}

export interface SheetBatchRowsPayload {
  spreadsheetId: string;
  range?: string;
  rows: (string | number)[][];
}

const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Llamada a la API de Google con timeout y manejo de errores común.
 *  - 401: el token venció o no es válido → WorkspaceAuthError (la UI pide reconectar).
 *  - 403: Google rechazó el permiso (falta de alcance, API no habilitada o sin acceso al recurso).
 *    Se informa como WorkspaceAuthError para que la UI ofrezca reconectar, pero con un mensaje
 *    que no afirma que la sesión "expiró", porque en un 403 normalmente no es eso.
 */
async function googleApiFetch(
  accessToken: string,
  url: string,
  init: { method?: string; body?: unknown } | undefined,
  messages: { auth: string; forbidden: string; generic: string }
): Promise<unknown> {
  const hasBody = init?.body !== undefined;
  let res: Response;
  try {
    res = await fetch(url, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(hasBody ? { body: JSON.stringify(init!.body) } : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    const timedOut = e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError');
    throw new Error(
      timedOut
        ? 'Google tardó demasiado en responder. Revisa tu conexión e inténtalo de nuevo.'
        : 'No se pudo conectar con Google. Revisa tu conexión e inténtalo de nuevo.'
    );
  }

  if (!res.ok) {
    if (res.status === 401) throw new WorkspaceAuthError(messages.auth, 401);
    if (res.status === 403) throw new WorkspaceAuthError(messages.forbidden, 403);
    const errorData = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    const message = errorData.error?.message || messages.generic;
    if (res.status === 404 || res.status === 410) throw new WorkspaceNotFoundError(message);
    throw new Error(message);
  }

  return res.json();
}

/**
 * List events from primary Google Calendar
 */
export async function getCalendarEvents(accessToken: string, maxResults = 10) {
  const timeMin = new Date().toISOString();
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(
    timeMin
  )}&maxResults=${maxResults}&singleEvents=true&orderBy=startTime`;

  const data = (await googleApiFetch(accessToken, url, undefined, {
    auth: 'La sesión de Google Calendar ha expirado. Por favor vuelve a conectar tu cuenta de Google.',
    forbidden:
      'Google Calendar rechazó el acceso. Vuelve a conectar tu cuenta de Google y acepta los permisos de Calendario.',
    generic: 'Error al obtener eventos del Calendario de Google',
  })) as { items?: unknown[] };
  return data.items || [];
}

/** Evento de Google Calendar con los campos que usa la importación a la agenda. */
export interface GoogleCalendarEvent {
  id: string;
  status?: string;
  eventType?: string;
  summary?: string;
  description?: string;
  location?: string;
  recurringEventId?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  extendedProperties?: { private?: Record<string, string> };
}

/**
 * Próximos eventos del calendario PRINCIPAL de la cuenta conectada, desde `timeMin`, en orden cronológico
 * y con los eventos repetidos ya expandidos. Solo lee: no modifica nada en Calendar.
 */
export async function listUpcomingCalendarEvents(
  accessToken: string,
  options: { timeMin: string; maxResults: number }
): Promise<GoogleCalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: options.timeMin,
    maxResults: String(Math.min(Math.max(options.maxResults, 1), 250)),
    singleEvents: 'true',
    orderBy: 'startTime',
    fields: 'items(id,status,eventType,summary,description,location,recurringEventId,start,end,extendedProperties/private)',
  });
  const data = (await googleApiFetch(
    accessToken,
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    undefined,
    {
      auth: 'La sesión de Google Calendar ha expirado. Por favor vuelve a conectar tu cuenta de Google.',
      forbidden:
        'Google Calendar rechazó el acceso. Vuelve a conectar tu cuenta de Google y acepta los permisos de Calendario.',
      generic: 'Error al leer los eventos del Calendario de Google',
    }
  )) as { items?: GoogleCalendarEvent[] };
  return Array.isArray(data.items) ? data.items : [];
}

interface GoogleCalendarEventBody {
  summary: string;
  description: string;
  location: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
  recurrence?: string[];
  extendedProperties?: { private: Record<string, string> };
  status?: 'confirmed' | 'cancelled';
  attendees?: { email: string; displayName?: string; responseStatus?: string; optional?: boolean }[];
  guestsCanSeeOtherGuests?: boolean;
  guestsCanInviteOthers?: boolean;
  guestsCanModify?: boolean;
}

const CALENDAR_EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

/** Correos válidos, en minúscula y sin repetir, hasta el tope por evento. */
function sanitizeAttendeeEmails(emails: string[] | undefined): string[] {
  const unique = new Set<string>();
  for (const raw of emails ?? []) {
    const clean = (raw ?? '').trim().toLowerCase();
    if (!/[\r\n]/.test(clean) && SIMPLE_EMAIL_RE.test(clean)) unique.add(clean);
  }
  return [...unique].slice(0, MAX_CALENDAR_ATTENDEES);
}

/** Los invitados solo reciben el evento: no ven a los demás, no pueden invitar ni modificarlo. */
const GUEST_PERMISSIONS = {
  guestsCanSeeOtherGuests: false,
  guestsCanInviteOthers: false,
  guestsCanModify: false,
} as const;

const CALENDAR_EVENT_MESSAGES = {
  auth: 'La sesión de Google Calendar ha expirado. Por favor vuelve a conectar tu cuenta de Google.',
  forbidden:
    'Google Calendar rechazó la operación. Vuelve a conectar tu cuenta de Google y acepta los permisos de Calendario.',
};

function buildCalendarEventBody(event: CalendarEventPayload): GoogleCalendarEventBody {
  // Los horarios sin desfase explícito se interpretan en la zona horaria INSTITUCIONAL,
  // no en la del navegador de quien carga el evento (para que no cambie si alguien viaja).
  const tz = INSTITUTIONAL_TIMEZONE;
  const hasExplicitOffset = (dt?: string) => {
    if (!dt) return false;
    return dt.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dt);
  };

  const body: GoogleCalendarEventBody = {
    summary: event.summary,
    description: event.description || '',
    location: event.location || 'Instituto de Capacitación Legislativa',
    start: event.startDate
      ? { date: event.startDate }
      : hasExplicitOffset(event.startDateTime)
      ? { dateTime: event.startDateTime! }
      : {
          dateTime: event.startDateTime || new Date().toISOString(),
          timeZone: tz,
        },
    end: event.startDate
      ? { date: event.endDate || event.startDate }
      : hasExplicitOffset(event.endDateTime)
      ? { dateTime: event.endDateTime! }
      : {
          dateTime: event.endDateTime || new Date(Date.now() + 3600000).toISOString(),
          timeZone: tz,
        },
  };

  if (event.recurrence && event.recurrence.length > 0) {
    body.recurrence = event.recurrence;
  }
  return body;
}

/**
 * Create a new event on user's Google Calendar.
 * Devuelve el id del evento creado (para poder actualizarlo o cancelarlo después). Si se pasan `attendees`,
 * el evento aparece en el calendario de cada uno SIN enviarles email (`sendUpdates=none`).
 */
export async function createCalendarEvent(
  accessToken: string,
  event: CalendarEventPayload
): Promise<{ id?: string }> {
  const body = buildCalendarEventBody(event);

  // Marca de origen (propiedad privada del evento, no visible en Calendar): la importación desde Calendar
  // la usa para no traer de vuelta lo que ya salió de la intranet.
  body.extendedProperties = {
    private: { iclSource: 'intranet', ...(event.activityId ? { iclActivityId: event.activityId } : {}) },
  };

  const attendees = sanitizeAttendeeEmails(event.attendees);
  if (attendees.length > 0) {
    body.attendees = attendees.map((email) => ({ email }));
    Object.assign(body, GUEST_PERMISSIONS);
  }

  const created = (await googleApiFetch(
    accessToken,
    `${CALENDAR_EVENTS_URL}?sendUpdates=none`,
    { method: 'POST', body },
    { ...CALENDAR_EVENT_MESSAGES, generic: 'Error al agendar evento en Google Calendar' }
  )) as { id?: string };
  return { id: typeof created.id === 'string' ? created.id : undefined };
}

/**
 * Actualiza (o cancela, con `cancelled`) un evento que ya existe en el calendario principal de la cuenta
 * conectada. Nunca envía emails (`sendUpdates=none`). Si se pasan `attendees`, se SUMAN a los invitados que el
 * evento ya tiene (por ejemplo, los de un evento importado): no se quita a nadie ni se pierde su respuesta.
 * Lanza `WorkspaceNotFoundError` si el evento no existe en ese calendario.
 */
export async function updateCalendarEvent(
  accessToken: string,
  eventId: string,
  event: CalendarEventPayload,
  options: { cancelled?: boolean } = {}
): Promise<void> {
  const eventUrl = `${CALENDAR_EVENTS_URL}/${encodeURIComponent(eventId)}`;
  const messages = { ...CALENDAR_EVENT_MESSAGES, generic: 'Error al actualizar el evento en Google Calendar' };

  if (options.cancelled) {
    await googleApiFetch(accessToken, `${eventUrl}?sendUpdates=none`, { method: 'PATCH', body: { status: 'cancelled' } }, messages);
    return;
  }

  const body = buildCalendarEventBody(event);
  body.status = 'confirmed';

  const wanted = sanitizeAttendeeEmails(event.attendees);
  if (wanted.length > 0) {
    const current = (await googleApiFetch(
      accessToken,
      `${eventUrl}?fields=attendees(email,displayName,responseStatus,optional)`,
      undefined,
      messages
    )) as { attendees?: NonNullable<GoogleCalendarEventBody['attendees']> };
    const existing = current.attendees ?? [];
    const known = new Set(existing.map((a) => a.email.toLowerCase()));
    body.attendees = [...existing, ...wanted.filter((email) => !known.has(email)).map((email) => ({ email }))].slice(
      0,
      MAX_CALENDAR_ATTENDEES
    );
    Object.assign(body, GUEST_PERMISSIONS);
  }

  await googleApiFetch(accessToken, `${eventUrl}?sendUpdates=none`, { method: 'PATCH', body }, messages);
}

/**
 * Evita la inyección de fórmulas en Google Sheets: con `USER_ENTERED`, un texto que empieza con
 * = + - @ (o tabulación / retorno) se evalúa como fórmula (por ejemplo =IMPORTDATA(...) o
 * =HYPERLINK(...) permitiría exfiltrar datos de la planilla). Se antepone un apóstrofo, que Sheets
 * interpreta como "texto literal" y no se muestra. Los números reales (type number) no se tocan.
 */
export function neutralizeSheetFormula(value: string | number): string | number {
  if (typeof value !== 'string') return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/**
 * Append single row to an existing Google Spreadsheet
 */
export async function appendToSheet(accessToken: string, payload: SheetRowPayload) {
  return appendRowsToSheet(accessToken, {
    spreadsheetId: payload.spreadsheetId,
    range: payload.range,
    rows: [payload.values],
  });
}

/**
 * Normaliza un rango A1 para la API de Sheets: si el nombre de la hoja tiene espacios u otros
 * caracteres especiales, debe ir entre comillas simples ('Registro Instituto'!A1). Un rango sin
 * hoja (A1:B2) o con la hoja ya entrecomillada se devuelve igual.
 */
export function normalizeSheetRange(range: string): string {
  const trimmed = range.trim();
  const bang = trimmed.lastIndexOf('!');
  if (bang <= 0) return trimmed;
  const sheet = trimmed.slice(0, bang);
  const cells = trimmed.slice(bang + 1);
  if (sheet.startsWith("'") && sheet.endsWith("'") && sheet.length >= 2) return trimmed;
  if (/^[A-Za-z0-9_]+$/.test(sheet)) return trimmed;
  return `'${sheet.replace(/'/g, "''")}'!${cells}`;
}

/**
 * Batch append multiple rows to an existing Google Spreadsheet in a single HTTP request
 * Avoids N+1 rate limiting and network stalls
 */
export async function appendRowsToSheet(accessToken: string, payload: SheetBatchRowsPayload) {
  const range = normalizeSheetRange(payload.range || 'Sheet1!A1');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    payload.spreadsheetId
  )}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;

  return googleApiFetch(
    accessToken,
    url,
    { method: 'POST', body: { values: payload.rows.map((row) => row.map(neutralizeSheetFormula)) } },
    {
      auth: 'La sesión de Google Sheets ha expirado. Por favor vuelve a conectar tu cuenta de Google.',
      forbidden:
        'Google Sheets rechazó el acceso a la planilla. Verifica que tu cuenta tenga permiso de edición sobre ella y vuelve a conectar Google.',
      generic: 'Error al guardar en Google Sheets',
    }
  );
}

/**
 * Create a new Google Spreadsheet for records
 */
/** Hoja inicial creada con la planilla: es la que usa el rango de exportación de la agenda. */
export const DEFAULT_SHEET_TAB_TITLE = 'Registro Instituto';

export interface CreatedSpreadsheet {
  spreadsheetId: string;
  spreadsheetUrl?: string;
}

export async function createGoogleSheet(accessToken: string, title: string): Promise<CreatedSpreadsheet> {
  const url = 'https://sheets.googleapis.com/v4/spreadsheets';

  const created = (await googleApiFetch(
    accessToken,
    url,
    {
      method: 'POST',
      body: {
        properties: { title },
        sheets: [
          {
            properties: {
              title: DEFAULT_SHEET_TAB_TITLE,
              gridProperties: { frozenRowCount: 1 },
            },
          },
        ],
      },
    },
    {
      auth: 'La sesión de Google Workspace ha expirado. Por favor vuelve a conectar tu cuenta de Google.',
      forbidden:
        'Google rechazó la creación de la planilla. Vuelve a conectar tu cuenta de Google y acepta los permisos de Sheets.',
      generic: 'Error al crear la planilla de Google Sheets',
    }
  )) as Partial<CreatedSpreadsheet> | null;

  if (!created || typeof created.spreadsheetId !== 'string' || !created.spreadsheetId) {
    throw new Error('Google no devolvió el identificador de la planilla creada. Inténtalo de nuevo.');
  }
  return { spreadsheetId: created.spreadsheetId, spreadsheetUrl: created.spreadsheetUrl };
}

/**
 * Valida una dirección de correo individual y rechaza saltos de línea.
 * Un CR/LF en `To`/`From` permitiría inyectar cabeceras (por ejemplo `Bcc:`) y usar la cuenta
 * del usuario para enviar correo a terceros sin que lo note.
 */
const SIMPLE_EMAIL_RE = /^[^\s@<>,;"']+@[^\s@<>,;"']+\.[^\s@<>,;"']+$/;

export function assertSafeEmailAddress(address: string, field: string): string {
  const clean = (address ?? '').trim();
  if (/[\r\n]/.test(clean) || !SIMPLE_EMAIL_RE.test(clean)) {
    throw new Error(`La dirección de correo del campo "${field}" no es válida.`);
  }
  return clean;
}

/** Igual que `assertSafeEmailAddress` pero admite varios destinatarios separados por coma o punto y coma. */
export function assertSafeEmailList(list: string, field: string): string {
  if (/[\r\n]/.test(list ?? '')) {
    throw new Error(`La dirección de correo del campo "${field}" no es válida.`);
  }
  const parts = (list ?? '')
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) throw new Error(`El campo "${field}" no puede estar vacío.`);
  return parts.map((p) => assertSafeEmailAddress(p, field)).join(', ');
}

/**
 * Send an email via Gmail API with standard RFC 2822 formatting
 */
export async function sendGmailMessage(accessToken: string, payload: SendEmailPayload) {
  const to = assertSafeEmailList(payload.to, 'Para');
  const from = payload.from ? assertSafeEmailAddress(payload.from, 'De') : null;
  const utf8Subject = `=?utf-8?B?${utf8ToBase64(payload.subject.replace(/[\r\n]+/g, ' '))}?=`;

  const fromHeader = from
    ? (payload.senderName
        ? `From: =?utf-8?B?${utf8ToBase64(payload.senderName.replace(/[\r\n]+/g, ' '))}?= <${from}>`
        : `From: <${from}>`)
    : null;

  const messageParts = [
    ...(fromHeader ? [fromHeader] : []),
    `To: ${to}`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
    `Subject: ${utf8Subject}`,
    '',
    payload.body,
  ];
  const message = messageParts.join('\r\n');

  const encodedMessage = utf8ToBase64Url(message);

  const url = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
  return googleApiFetch(
    accessToken,
    url,
    { method: 'POST', body: { raw: encodedMessage } },
    {
      auth: 'La sesión de Gmail ha expirado. Por favor vuelve a conectar tu cuenta de Google.',
      forbidden:
        'Gmail rechazó el envío. Vuelve a conectar tu cuenta de Google y acepta el permiso de envío de correo.',
      generic: 'Error al enviar correo mediante Gmail',
    }
  );
}
