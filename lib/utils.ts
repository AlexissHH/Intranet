import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const INSTITUTIONAL_TIMEZONE = 'America/Argentina/Buenos_Aires';
// Argentina no aplica horario de verano (UTC-3 todo el año). Si INSTITUTIONAL_TIMEZONE cambia a una
// zona con horario de verano, este desfase fijo deja de ser válido y debe calcularse con Intl.
const INSTITUTIONAL_UTC_OFFSET = '-03:00';

/**
 * Identificador único con prefijo. Usa crypto.randomUUID cuando existe; Date.now() solo no
 * alcanza (dos registros creados en el mismo milisegundo colisionan). El stamp base36 delante
 * hace que los ids ordenen lexicográficamente por tiempo de creación: al mapear cada registro
 * a un documento de Firestore (id = item.id), el orden natural de los docs reproduce el orden
 * de inserción de la lista (los snapshots remotos ordenan por doc id). Compatibilidad: los ids
 * previos siguen siendo válidos, solo no garantizan orden temporal entre sí.
 */
export function generateId(prefix: string): string {
  const c = typeof globalThis !== 'undefined' ? (globalThis.crypto as Crypto | undefined) : undefined;
  const stamp = Date.now().toString(36);
  if (c && typeof c.randomUUID === 'function') return `${prefix}-${stamp}-${c.randomUUID()}`;
  return `${prefix}-${stamp}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Convierte "YYYY-MM-DD" en una fecha local a mediodía (evita saltos de día por zona horaria).
 * Devuelve null si el texto no tiene tres partes numéricas.
 */
function parseYmdLocalNoon(dateStr: string): Date | null {
  const parts = (dateStr || '').split('-');
  if (parts.length !== 3) return null;
  const [y, m, d] = parts.map(Number);
  if ([y, m, d].some((n) => !Number.isFinite(n))) return null;
  return new Date(y, m - 1, d, 12, 0, 0);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}
const WEEKDAYS_SHORT_ES = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const WEEKDAYS_LOWER_ES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTHS_SHORT_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * Returns { year, month (0-11), day (1-31) } in the institutional timezone (Argentina)
 * so SSR (UTC) and Client Hydration (any browser timezone) always render identical dates.
 */
export function getInstitutionalTodayParts(now: Date = new Date()): {
  year: number;
  month: number;
  day: number;
} {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: INSTITUTIONAL_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(now);
    const year = Number(parts.find((p) => p.type === 'year')?.value || now.getFullYear());
    const month = Number(parts.find((p) => p.type === 'month')?.value || now.getMonth() + 1) - 1;
    const day = Number(parts.find((p) => p.type === 'day')?.value || now.getDate());
    return { year, month, day };
  } catch {
    return {
      year: now.getFullYear(),
      month: now.getMonth(),
      day: now.getDate(),
    };
  }
}

/**
 * Returns YYYY-MM-DD in local time (or institutional timezone when called with no arguments)
 * to avoid UTC day-shift and SSR/Client hydration mismatches.
 */
export function getLocalDateString(d?: Date): string {
  if (!d) {
    const { year, month, day } = getInstitutionalTodayParts();
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns YYYY-MM-DD offset by daysOffset from today in the institutional timezone
 */
export function getOffsetDateString(daysOffset = 0): string {
  const { year, month, day } = getInstitutionalTodayParts();
  const d = new Date(year, month, day + daysOffset, 12, 0, 0, 0);
  return getLocalDateString(d);
}

/**
 * Returns deterministic uppercase 3-letter Spanish weekday for YYYY-MM-DD
 */
export function getShortWeekdayEs(dateStr: string): string {
  const d = parseYmdLocalNoon(dateStr);
  return d ? WEEKDAYS_SHORT_ES[d.getDay()] || '' : '';
}

/**
 * Formats a YYYY-MM-DD string into a friendly localized Spanish date
 */
export function formatDateDisplay(dateStr: string, options?: Intl.DateTimeFormatOptions): string {
  if (!dateStr) return '';
  const d = parseYmdLocalNoon(dateStr);
  if (!d) return dateStr;
  if (options) {
    return d.toLocaleDateString('es-AR', options);
  }
  const w = WEEKDAYS_LOWER_ES[d.getDay()];
  const day = d.getDate();
  const m = MONTHS_SHORT_ES[d.getMonth()];
  return `${w}, ${day} ${m}`;
}

/** Codifica texto UTF-8 como Base64 estándar (sin usar el obsoleto unescape()). */
export function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Codifica texto UTF-8 como Base64URL (sin relleno), el formato que exige la API de Gmail. */
export function utf8ToBase64Url(str: string): string {
  return utf8ToBase64(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const MONTH_NAMES_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export interface BirthdayInfo {
  day: number;
  month: number; // 0 to 11
  year?: number;
  formatted: string;
  raw: string;
}

export interface BirthdayCountdown {
  daysLeft: number;
  nextDate: Date;
  nextDateStr: string; // YYYY-MM-DD
  isToday: boolean;
  isWithin5Days: boolean;
  formattedBirthday: string;
}

/** Día/mes plausibles: mes 0-11 y día dentro del mes (29/02 se acepta por los años bisiestos). */
function isValidDayMonth(day: number, month: number): boolean {
  if (!Number.isInteger(day) || !Number.isInteger(month)) return false;
  if (month < 0 || month > 11) return false;
  return day >= 1 && day <= daysInMonth(2024, month);
}

/**
 * Parses birthday strings like "19/03", "05/01/1984", "05 ENERO 1984", "1984-01-05"
 */
export function parseBirthday(raw: string): BirthdayInfo | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Format 1: ISO or delimiter (YYYY-MM-DD or DD/MM/YYYY or DD/MM)
  if (trimmed.includes('/') || trimmed.includes('-')) {
    const parts = trimmed.split(/[/.-]/).map((p) => p.trim());
    if (parts.length >= 2) {
      if (parts[0].length === 4) {
        // YYYY-MM-DD
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        if (isValidDayMonth(day, month)) {
          const mTitle = MONTH_NAMES_ES[month].charAt(0).toUpperCase() + MONTH_NAMES_ES[month].slice(1);
          return { day, month, year, formatted: `${day} de ${mTitle} (${year})`, raw: trimmed };
        }
      } else {
        // DD/MM or DD/MM/YYYY
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parts[2] ? parseInt(parts[2], 10) : undefined;
        if (isValidDayMonth(day, month)) {
          const mTitle = MONTH_NAMES_ES[month].charAt(0).toUpperCase() + MONTH_NAMES_ES[month].slice(1);
          return {
            day,
            month,
            year,
            formatted: year ? `${day} de ${mTitle} (${year})` : `${day} de ${mTitle}`,
            raw: trimmed,
          };
        }
      }
    }
  }

  // Format 2: "05 ENERO 1984" or "19 de Marzo"
  const match = trimmed.match(/(\d{1,2})\s*(?:de)?\s*([a-zA-ZÁÉÍÓÚáéíóúñÑ]+)(?:\s*(?:de)?\s*(\d{4}))?/i);
  if (match) {
    const day = parseInt(match[1], 10);
    const mStr = match[2].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let monthIdx = -1;
    if (mStr.startsWith('ene')) monthIdx = 0;
    else if (mStr.startsWith('feb')) monthIdx = 1;
    else if (mStr.startsWith('mar')) monthIdx = 2;
    else if (mStr.startsWith('abr')) monthIdx = 3;
    else if (mStr.startsWith('may')) monthIdx = 4;
    else if (mStr.startsWith('jun')) monthIdx = 5;
    else if (mStr.startsWith('jul')) monthIdx = 6;
    else if (mStr.startsWith('ago')) monthIdx = 7;
    else if (mStr.startsWith('sep') || mStr.startsWith('set')) monthIdx = 8;
    else if (mStr.startsWith('oct')) monthIdx = 9;
    else if (mStr.startsWith('nov')) monthIdx = 10;
    else if (mStr.startsWith('dic')) monthIdx = 11;

    if (monthIdx >= 0 && isValidDayMonth(day, monthIdx)) {
      const year = match[3] ? parseInt(match[3], 10) : undefined;
      const mTitle = MONTH_NAMES_ES[monthIdx].charAt(0).toUpperCase() + MONTH_NAMES_ES[monthIdx].slice(1);
      return {
        day,
        month: monthIdx,
        year,
        formatted: year ? `${day} de ${mTitle} (${year})` : `${day} de ${mTitle}`,
        raw: trimmed,
      };
    }
  }

  return null;
}

/**
 * Calculates days remaining until the next birthday occurrence
 */
export function getBirthdayCountdown(rawBirthday: string, fromDate?: Date): BirthdayCountdown | null {
  const info = parseBirthday(rawBirthday);
  if (!info) return null;

  const { year: currentYear, month: currentMonth, day: currentDay } = fromDate
    ? { year: fromDate.getFullYear(), month: fromDate.getMonth(), day: fromDate.getDate() }
    : getInstitutionalTodayParts();
  const todayMidnight = new Date(currentYear, currentMonth, currentDay, 0, 0, 0, 0);
  const thisYearBday = new Date(currentYear, info.month, info.day, 0, 0, 0, 0);

  let nextDate: Date;
  if (thisYearBday.getTime() < todayMidnight.getTime()) {
    nextDate = new Date(currentYear + 1, info.month, info.day, 0, 0, 0, 0);
  } else {
    nextDate = thisYearBday;
  }

  const diffMs = nextDate.getTime() - todayMidnight.getTime();
  const daysLeft = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const isToday = daysLeft === 0;
  const isWithin5Days = daysLeft >= 0 && daysLeft <= 5;
  const nextDateStr = getLocalDateString(nextDate);

  return {
    daysLeft,
    nextDate,
    nextDateStr,
    isToday,
    isWithin5Days,
    formattedBirthday: info.formatted,
  };
}

/**
 * Compresses and resizes an image File using an offscreen HTML5 canvas.
 * Reduces raw camera photos (e.g., 5-15MB) to ~80-150KB for fast loading and safe localStorage persistence.
 */
export function compressImageFile(
  file: File,
  maxWidth = 1200,
  maxHeight = 800,
  quality = 0.82
): Promise<string> {
  return new Promise((resolve) => {
    // If not in browser or not an image, fallback to raw FileReader
    if (typeof window === 'undefined' || !file.type.startsWith('image/') || file.type === 'image/svg+xml') {
      const reader = new FileReader();
      reader.onload = (e) => resolve((e.target?.result as string) || '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve((e.target?.result as string) || '');
          return;
        }

        // JPEG no admite transparencia: sin fondo blanco, los PNG con transparencia quedan en negro.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        // Export as JPEG for high efficiency and universal compatibility
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      };
      img.onerror = () => {
        resolve((e.target?.result as string) || '');
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

/**
 * Safely parses YYYY-MM-DD date and HH:mm time into an ISO 8601 string.
 *
 * La fecha/hora se interpreta en la zona horaria INSTITUCIONAL (Argentina, UTC-3), no en la del
 * navegador, de modo que una actividad "10:00" sea a las 10:00 de Buenos Aires para todos.
 * Valores fuera de rango (31/02, 25:70) se descartan y se usa la hora por defecto / el día actual.
 */
export function buildSafeIsoDateTime(dateStr: string, timeStr?: string, defaultHour = 9): string {
  try {
    const cleanDate = (dateStr || '').trim();
    let hours = defaultHour;
    let minutes = 0;

    if (timeStr && timeStr.trim()) {
      const parts = timeStr.trim().split(':');
      if (parts.length >= 2) {
        const parsedHours = parseInt(parts[0], 10);
        const parsedMinutes = parseInt(parts[1], 10);
        if (Number.isInteger(parsedHours) && parsedHours >= 0 && parsedHours <= 23) hours = parsedHours;
        if (Number.isInteger(parsedMinutes) && parsedMinutes >= 0 && parsedMinutes <= 59) minutes = parsedMinutes;
      }
    }

    let y: number;
    let m: number; // 0-11
    let d: number;
    const dateParts = cleanDate.split('-').map((p) => parseInt(p, 10));
    if (
      dateParts.length === 3 &&
      dateParts.every((n) => Number.isInteger(n)) &&
      dateParts[1] >= 1 &&
      dateParts[1] <= 12 &&
      dateParts[2] >= 1 &&
      dateParts[2] <= daysInMonth(dateParts[0], dateParts[1] - 1)
    ) {
      [y, m, d] = [dateParts[0], dateParts[1] - 1, dateParts[2]];
    } else {
      ({ year: y, month: m, day: d } = getInstitutionalTodayParts());
    }

    const pad = (n: number, len = 2) => String(n).padStart(len, '0');
    const iso = `${pad(y, 4)}-${pad(m + 1)}-${pad(d)}T${pad(hours)}:${pad(minutes)}:00${INSTITUTIONAL_UTC_OFFSET}`;
    const instant = new Date(iso);
    return isNaN(instant.getTime()) ? new Date().toISOString() : instant.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

/** Fecha local a mediodía a partir de un string YYYY-MM-DD o un Date; null si no es interpretable. */
function toLocalNoonDate(dateOrStr: string | Date): Date | null {
  return typeof dateOrStr === 'string' ? parseYmdLocalNoon(dateOrStr) : dateOrStr;
}

/**
 * Checks if a date (string YYYY-MM-DD or Date object) falls on a weekend (Saturday or Sunday)
 */
export function isWeekendDay(dateOrStr: string | Date): boolean {
  if (!dateOrStr) return false;
  const d = toLocalNoonDate(dateOrStr);
  if (!d) return false;
  const day = d.getDay();
  return day === 0 || day === 6; // 0 = Domingo, 6 = Sábado
}

/**
 * Returns Spanish name for weekend day ('Sábado' | 'Domingo' | '')
 */
export function getWeekendDayName(dateOrStr: string | Date): string {
  if (!dateOrStr) return '';
  const d = toLocalNoonDate(dateOrStr);
  if (!d) return '';
  const day = d.getDay();
  if (day === 6) return 'Sábado';
  if (day === 0) return 'Domingo';
  return '';
}

/**
 * Returns the next business day (Monday - Friday) as YYYY-MM-DD string.
 * Nota: considera solo fines de semana; NO contempla feriados nacionales/provinciales.
 */
export function getNextBusinessDayString(dateOrStr?: string | Date): string {
  let d: Date | null = null;
  if (dateOrStr) {
    d = typeof dateOrStr === 'string' ? parseYmdLocalNoon(dateOrStr) : new Date(dateOrStr);
  }
  if (!d) {
    const { year, month, day } = getInstitutionalTodayParts();
    d = new Date(year, month, day, 12, 0, 0);
  }

  // If Sunday (0), advance 1 day to Monday
  if (d.getDay() === 0) {
    d.setDate(d.getDate() + 1);
  } else if (d.getDay() === 6) {
    // If Saturday (6), advance 2 days to Monday
    d.setDate(d.getDate() + 2);
  }
  return getLocalDateString(d);
}

/**
 * Neutraliza la "inyección de fórmulas" en CSV/Excel: una celda que empieza con = + - @ (o
 * tabulación / retorno) se ejecuta como fórmula al abrir el archivo. Se antepone un apóstrofo.
 */
export function neutralizeCsvFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** Subconjunto de una actividad que se exporta a CSV. */
export interface CsvActivityRow {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  type: string;
  title: string;
  location: string;
  responsible: string;
  institution?: string;
  level?: string;
  attendeesCount?: number | string;
  status: string;
  description?: string;
}

/**
 * Exports activities array to a formatted CSV spreadsheet file compatible with Excel and Sheets
 */
export function exportActivitiesToCsv(
  activities: CsvActivityRow[],
  filename = `Planilla_Maestra_Instituto_${getInstitutionalTodayParts().year}.csv`
) {
  if (typeof window === 'undefined') return;
  const headers = [
    'ID',
    'Fecha',
    'Hora Inicio',
    'Hora Fin',
    'Tipo',
    'Título / Actividad',
    'Ubicación',
    'Responsable',
    'Institución Educativa',
    'Nivel Educativo',
    'Asistentes Estimados',
    'Estado',
    'Descripción',
  ];

  const escapeCsv = (val: unknown) => {
    if (val === null || val === undefined) return '""';
    const str = neutralizeCsvFormula(String(val)).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = activities.map((act) => [
    escapeCsv(act.id),
    escapeCsv(act.date),
    escapeCsv(act.startTime),
    escapeCsv(act.endTime),
    escapeCsv(act.type),
    escapeCsv(act.title),
    escapeCsv(act.location),
    escapeCsv(act.responsible),
    escapeCsv(act.institution || ''),
    escapeCsv(act.level || ''),
    escapeCsv(act.attendeesCount || ''),
    escapeCsv(act.status),
    escapeCsv(act.description || ''),
  ]);

  const csvContent = '﻿' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
