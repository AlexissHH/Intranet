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

/* ── Secciones visibles por usuario ───────────────────────────────────────── */

/**
 * Secciones de la intranet que Administración puede habilitar u ocultar a cada usuario visitante
 * (campo opcional `allowedSections` de su ficha en authorized_users). El Panel de Administración no
 * figura: solo lo ven los administradores, que además ven todas las secciones.
 *
 * Importante: es una preferencia de PRESENTACIÓN. Oculta pestañas, tarjetas y accesos, pero no es una
 * barrera de acceso a los datos: las reglas de Firestore siguen dejando leer el contenido a todo usuario
 * aprobado.
 */
export const INTRANET_SECTIONS = [
  { id: 'inicio', label: 'Inicio' },
  { id: 'instituto', label: 'Instituto' },
  { id: 'capacitacion', label: 'Capacitación' },
  { id: 'programas', label: 'Programas y Proyectos' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'recursos', label: 'Recursos' },
  { id: 'equipo', label: 'Equipo' },
  { id: 'enlaces', label: 'Enlaces' },
] as const;

export type IntranetSectionId = (typeof INTRANET_SECTIONS)[number]['id'];

const INTRANET_SECTION_IDS: readonly string[] = INTRANET_SECTIONS.map((s) => s.id);

export function isIntranetSectionId(value: unknown): value is IntranetSectionId {
  return typeof value === 'string' && INTRANET_SECTION_IDS.includes(value);
}

/**
 * Normaliza el campo guardado: devuelve las secciones válidas en el orden del menú, o `undefined` si el
 * campo no existe o no es una lista (sin restricción: el usuario ve todas las secciones).
 */
export function parseAllowedSections(raw: unknown): IntranetSectionId[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const wanted = new Set(raw.filter(isIntranetSectionId));
  return INTRANET_SECTIONS.map((s) => s.id).filter((id) => wanted.has(id));
}

/** true si la lista habilita todas las secciones (equivale a no tener restricción). */
export function coversAllSections(sections: readonly IntranetSectionId[]): boolean {
  return INTRANET_SECTIONS.every((s) => sections.includes(s.id));
}
