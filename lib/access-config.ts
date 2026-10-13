/**
 * Configuración de acceso compartida entre cliente y servidor.
 *
 * Módulo isomórfico: NO usa APIs del navegador ni importa Firebase, de modo que
 * tanto `lib/auth.ts` (cliente) como las rutas de API (servidor) leen la MISMA
 * fuente de verdad para administradores y visitantes.
 *
 * Importante: las variables NEXT_PUBLIC_* quedan incrustadas en el JavaScript
 * que se envía al navegador, por lo que NO son secretas. La identidad de un
 * administrador nunca se decide por esta lista a solas: siempre debe combinarse
 * con un email verificado por Google (en el servidor, con un ID token de
 * Firebase verificado criptográficamente).
 *
 * Nota: `process.env.NEXT_PUBLIC_*` debe escribirse de forma literal para que
 * Next.js lo reemplace en tiempo de build; no usar acceso dinámico.
 */

/** Administrador maestro principal (siempre presente, además de los que defina el entorno). */
export const MASTER_ADMIN_EMAIL = 'alexishinojosa1600@gmail.com';

/** Administradores por defecto del Instituto (siempre presentes, además de los del entorno). */
export const DEFAULT_MASTER_ADMIN_EMAILS: readonly string[] = [
  MASTER_ADMIN_EMAIL,
  'instcapacitacionlegis@gmail.com',
];

export function normalizeEmail(email?: string | null): string {
  return (email ?? '').trim().toLowerCase();
}

/** Convierte "a@x.com, B@y.com" en ['a@x.com', 'b@y.com'] (sin vacíos ni duplicados). */
export function parseEmailList(raw?: string | null): string[] {
  if (!raw) return [];
  const list = raw
    .split(',')
    .map((e) => normalizeEmail(e))
    .filter(Boolean);
  return Array.from(new Set(list));
}

export const MASTER_ADMIN_EMAILS: string[] = Array.from(
  new Set([...DEFAULT_MASTER_ADMIN_EMAILS, ...parseEmailList(process.env.NEXT_PUBLIC_MASTER_ADMIN_EMAILS)])
);

export const DEFAULT_VISITOR_EMAILS: string[] = [];

export const ALLOWED_VISITOR_EMAILS: string[] = Array.from(
  new Set([
    ...DEFAULT_VISITOR_EMAILS,
    ...parseEmailList(
      process.env.NEXT_PUBLIC_ALLOWED_VISITOR_EMAILS || process.env.NEXT_PUBLIC_VISITOR_EMAILS
    ),
  ])
);

export const VISITOR_TEST_EMAIL = ALLOWED_VISITOR_EMAILS[0] || '';

export function isMasterAdminEmail(email?: string | null): boolean {
  const clean = normalizeEmail(email);
  return clean !== '' && MASTER_ADMIN_EMAILS.includes(clean);
}

export function isAllowedVisitorEmail(email?: string | null): boolean {
  const clean = normalizeEmail(email);
  return clean !== '' && ALLOWED_VISITOR_EMAILS.includes(clean);
}
