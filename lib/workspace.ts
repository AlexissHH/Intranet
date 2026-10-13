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
    throw new Error(errorData.error?.message || messages.generic);
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

/**
 * Create a new event on user's Google Calendar
 */
export async function createCalendarEvent(
  accessToken: string,
  event: CalendarEventPayload
) {
  const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

  interface GoogleCalendarEventBody {
    summary: string;
    description: string;
    location: string;
    start: { date?: string; dateTime?: string; timeZone?: string };
    end: { date?: string; dateTime?: string; timeZone?: string };
    recurrence?: string[];
  }

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

  return googleApiFetch(accessToken, url, { method: 'POST', body }, {
    auth: 'La sesión de Google Calendar ha expirado. Por favor vuelve a conectar tu cuenta de Google.',
    forbidden:
      'Google Calendar rechazó la operación. Vuelve a conectar tu cuenta de Google y acepta los permisos de Calendario.',
    generic: 'Error al agendar evento en Google Calendar',
  });
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
