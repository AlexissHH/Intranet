import {
  ActivityItem,
  NewsItem,
  TrainingCourse,
  ProjectProgram,
  ResourceDocument,
  QuickLink,
  TeamMember,
  InstituteAreaCard,
  AgentCourseAudit,
  CourseModuleCheck,
  INITIAL_ACTIVITIES,
  INITIAL_NEWS,
  INITIAL_COURSES,
  INITIAL_PROGRAMS,
  INITIAL_RESOURCES,
  INITIAL_LINKS,
  INITIAL_TEAM,
  INITIAL_INSTITUTE_AREAS,
  INITIAL_COURSE_AUDITS,
} from './mock-data';
import { generateId } from './utils';
import {
  ensureFirebaseApp,
  getIntranetDb,
  hasActivePushFailure,
  isBootstrapped,
  isSyncGateOpen,
  markBootstrapped,
  pushCollectionDiff,
  pushSingleDoc,
  registerGateOpenHandler,
  replaceCollection,
  subscribeToCollection,
  subscribeToSingleDoc,
} from './firestore';

/**
 * Claves de DATOS (contenido institucional). Versión bump a v2+: la v1/única anterior
 * contiene los datos de prueba del sistema; al cambiar de versión se ignoran y se
 * limpian al arrancar (ver CLEANUP de LEGACY_DATA_KEYS en initSharedBackend).
 * IMPORTANTE: las claves de USUARIOS/SESIÓN (lib/auth.ts) NO se tocan: las cuentas
 * administradoras reales no son datos de prueba.
 */
const STORAGE_KEYS = {
  ACTIVITIES: 'icl_intranet_activities_v2',
  NEWS: 'icl_intranet_news_v2',
  COURSES: 'icl_intranet_courses_v2',
  PROGRAMS: 'icl_intranet_programs_v2',
  RESOURCES: 'icl_intranet_resources_v2',
  LINKS: 'icl_intranet_links_v2',
  TEAM: 'icl_intranet_team_v3',
  AREAS: 'icl_intranet_institute_areas_v2',
  SETTINGS: 'icl_intranet_settings_v2',
  COURSE_AUDITS: 'icl_intranet_course_audits_v2',
  DELETED_RESOURCES: 'icl_intranet_deleted_resources_v2',
};

function safeGet<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const item = localStorage.getItem(key);
    if (!item) return fallback;
    const parsed = JSON.parse(item);
    // If fallback is an array, ensure parsed is also an array
    if (Array.isArray(fallback) && !Array.isArray(parsed)) {
      console.warn(`Storage key ${key} expected array, got ${typeof parsed}. Resetting to fallback.`);
      return fallback;
    }
    return parsed as T;
  } catch (e) {
    console.error(`Error reading ${key} from localStorage:`, e);
    return fallback;
  }
}

/* ──────────────────────────── BACKEND COMPARTIDO ────────────────────────────
 * Firestore es la fuente de verdad compartida entre dispositivos; localStorage
 * funciona como caché/armario local (misma escritura de siempre) y arranque
 * offline. Cada escritura (safeSet) se propaga a Firestore, y cada snapshot
 * entrante se reescribe en localStorage y notifica a la UI con el mismo evento
 * 'storage' que ya existe: los componentes no cambian.
 * orden: los guardo con el id cronológico de generateId, así que el orden de
 * los documentos reproduce el orden de inserción original de cada lista.
 */

/** Clave localStorage → colección Firestore con ItemType con `id`. */
const COLLECTION_BY_KEY: Record<string, string> = {
  [STORAGE_KEYS.ACTIVITIES]: 'activities',
  [STORAGE_KEYS.NEWS]: 'news',
  [STORAGE_KEYS.COURSES]: 'courses',
  [STORAGE_KEYS.PROGRAMS]: 'programs',
  [STORAGE_KEYS.RESOURCES]: 'resources',
  [STORAGE_KEYS.LINKS]: 'links',
  [STORAGE_KEYS.TEAM]: 'team',
  [STORAGE_KEYS.AREAS]: 'institute_areas',
  [STORAGE_KEYS.COURSE_AUDITS]: 'course_audits',
};

/** Listas donde lo más nuevo va al PRINCIPIO (upsert 'start'): orden remoto descendente. */
const NEWEST_FIRST_KEYS = new Set<string>([
  STORAGE_KEYS.ACTIVITIES,
  STORAGE_KEYS.NEWS,
  STORAGE_KEYS.COURSES,
  STORAGE_KEYS.RESOURCES,
  STORAGE_KEYS.COURSE_AUDITS,
]);

/** Documentos individuales (no colecciones) que también se comparten. */
const META_DOC_PATHS = {
  [STORAGE_KEYS.SETTINGS]: ['settings', 'app'],
  [STORAGE_KEYS.DELETED_RESOURCES]: ['meta', 'deleted_resources'],
} as const;

/** Evita reenviar a Firestore lo que recién volvió de Firestore (snapshots). */
let suppressRemotePush = false;

/** Solo se intenta sincronizar una vez por sesión. */
let backendSyncStarted = false;

function writeLocal(key: string, value: unknown): boolean {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    notifyStorageChanged(key);
    return true;
  } catch (e) {
    console.error(`Error writing ${key} to localStorage (remote snapshot):`, e);
    try {
      window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT, { detail: { key } }));
    } catch {
      // Ignore
    }
    return false;
  }
}

/** Ordena el snapshot remoto para reproducir el orden de inserción de cada lista. */
function sortRemoteItems(key: string, items: Record<string, unknown>[]): Record<string, unknown>[] {
  const sorted = [...items].sort((a, b) => String(a.__id ?? '').localeCompare(String(b.__id ?? '')));
  return NEWEST_FIRST_KEYS.has(key) ? sorted.reverse() : sorted;
}

/**
 * Inicializa la sincronización Firestore ⇄ localStorage (idempotente).
 * Si la app de Firebase todavía no existe (SSR o módulos que aún no cargaron),
 * se intentará nuevamente en la próxima escritura o lectura.
 */
function ensureBackendSync(): void {
  if (backendSyncStarted || typeof window === 'undefined') return;
  if (!ensureFirebaseApp()) return;
  const database = getIntranetDb();
  if (!database) return;
  // Gate de sesión: sin usuario aprobado/administrador no se abren listeners
  // (morirían con permission-denied y quedarían sin sincronizar). Al loguear,
  // registerGateOpenHandler vuelve a invocar esta función.
  if (!isSyncGateOpen()) return;
  backendSyncStarted = true;

  const idOf = (item: Record<string, unknown>): string =>
    String(item.id ?? item.__id ?? '');

  // 1) Colecciones de registros
  Object.entries(COLLECTION_BY_KEY).forEach(([localKey, collectionName]) => {
    const pushLocalToRemote = () => {
      const current = safeGet<unknown[]>(localKey, []);
      if (Array.isArray(current) && current.length >= 0) {
        void pushCollectionDiff(collectionName, current as Record<string, unknown>[], idOf);
      }
    };
    subscribeToCollection(collectionName, (remote) => {
      // Si el último push de esta clave falló (p. ej. reglas sin publicar), un snapshot
      // viejo NO debe revertir los cambios locales más recientes del usuario.
      if (hasActivePushFailure(collectionName)) return;
      if (remote.length === 0) {
        // Colección vacía = primero en conectarse con datos: se siembra lo local.
        if (!isBootstrapped(collectionName)) {
          markBootstrapped(collectionName);
          pushLocalToRemote();
        }
        return;
      }
      suppressRemotePush = true;
      try {
        writeLocal(localKey, sortRemoteItems(localKey, remote));
      } finally {
        suppressRemotePush = false;
      }
    });
    // Si Firestore no devuelve nada al conectar (offline del propio seed), igual se siembra
    // los datos locales al primer push que ocurra con un cambio real.
  });

  // 2) Documentos individuales (settings + lista de recursos eliminados)
  // Firestore exige documento-objeto: los arrays de ids viajan envueltos.
  Object.entries(META_DOC_PATHS).forEach(([localKey, [col, docId]]) => {
    const pathKey = localKey as string;
    const pushLocalToRemote = () => {
      const value = safeGet(pathKey, pathKey === STORAGE_KEYS.SETTINGS ? {} : []);
      void pushSingleDoc(String(col), String(docId), wrapMetaValue(pathKey, value));
    };
    subscribeToSingleDoc(String(col), String(docId), (remoteValue, exists) => {
      // Mismo guard que las colecciones: mientras el push Local falla, no revertir.
      if (hasActivePushFailure(`${col}/${docId}`)) return;
      if (!exists) {
        if (!isBootstrapped(pathKey)) {
          markBootstrapped(pathKey);
          pushLocalToRemote();
        }
        return;
      }
      suppressRemotePush = true;
      try {
        writeLocal(pathKey, unwrapMetaValue(pathKey, remoteValue));
      } finally {
        suppressRemotePush = false;
      }
    });
  });
}

/** Arrays (lista de ids eliminados) viajan dentro de un objeto-doc: envoltorio de salida. */
function wrapMetaValue(key: string, value: unknown): Record<string, unknown> {
  if (key === STORAGE_KEYS.DELETED_RESOURCES) {
    return { deletedResourceIds: Array.isArray(value) ? value : [] };
  }
  return value as Record<string, unknown>;
}

/** Contraparte de `wrapMetaValue` al aplicar snapshot entrante. */
function unwrapMetaValue(key: string, value: unknown): unknown {
  if (key === STORAGE_KEYS.DELETED_RESOURCES) {
    const wrapped = value as { deletedResourceIds?: unknown } | null | undefined;
    return Array.isArray(wrapped?.deletedResourceIds) ? wrapped!.deletedResourceIds : [];
  }
  return value;
}

/** Empuja a Firestore, salvo que el cambio provenga de un snapshot remoto. */
function pushRemoteUnlessSuppressed(key: string, value: unknown): void {
  if (suppressRemotePush || typeof window === 'undefined') return;
  ensureBackendSync();
  const collectionName = COLLECTION_BY_KEY[key];
  if (collectionName) {
    if (Array.isArray(value)) {
      const idOf = (item: Record<string, unknown>): string => String(item?.id ?? '');
      void pushCollectionDiff(collectionName, value as Record<string, unknown>[], idOf);
    } else {
      // No debería ocurrir: las claves de colección siempre guardan arrays.
      console.warn(`Storage key ${key} no guarda una lista; no se sincronizó.`);
    }
    return;
  }
  const meta = META_DOC_PATHS as Record<string, [string, string]> | undefined;
  const path = meta?.[key];
  if (path) {
    void pushSingleDoc(path[0], path[1], wrapMetaValue(key, value));
  }
}

/** Arranque público de la sincronización (la UI lo llama al montar la app). */
export function initSharedBackend(): void {
  cleanupLegacyDataKeys();
  ensureBackendSync();
}

// Sin sesión aprobada los listeners no se abren: al loguear el gate re-invoca esto.
if (typeof window !== 'undefined') {
  registerGateOpenHandler(() => ensureBackendSync());
}

/** Los tests/mock previos convivieron con estas claves: una v1 con datos de prueba. */
const LEGACY_DATA_KEYS = [
  'icl_intranet_activities_v1',
  'icl_intranet_news_v1',
  'icl_intranet_courses_v1',
  'icl_intranet_programs_v1',
  'icl_intranet_resources_v1',
  'icl_intranet_links_v1',
  'icl_intranet_team_v1',
  'icl_intranet_team_v2',
  'icl_intranet_institute_areas_v1',
  'icl_intranet_settings_v1',
  'icl_intranet_course_audits_v1',
  'icl_intranet_deleted_resources_v1',
];

/** Elimina la caché local de datos de prueba (una vez por sesión del navegador). */
function cleanupLegacyDataKeys(): void {
  if (typeof window === 'undefined' || cleanupLegacyDataKeysDone) return;
  cleanupLegacyDataKeysDone = true;
  LEGACY_DATA_KEYS.forEach((k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      // Ignore
    }
  });
}

let cleanupLegacyDataKeysDone = false;

function notifyStorageChanged(key?: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new StorageEvent('storage', { key: key || 'icl_intranet_all' }));
  } catch {
    window.dispatchEvent(new Event('storage'));
  }
}

/** Evento global que se emite cuando no se pudo guardar (cuota llena, modo privado, etc.). */
export const STORAGE_ERROR_EVENT = 'icl:storage-error';

/**
 * Guarda en localStorage (caché local) y propaga a Firestore (backend compartido).
 * Devuelve `false` si la escritura local falló (típicamente por cuota: las imágenes se
 * guardan en base64 y el límite ronda los 5 MB) y emite `STORAGE_ERROR_EVENT`.
 * La propagación a Firestore es asíncrona y su error se reporta vía FIRESTORE_ERROR_EVENT.
 */
function safeSet<T>(key: string, value: T): boolean {
  const ok = writeLocal(key, value);
  if (ok) pushRemoteUnlessSuppressed(key, value);
  return ok;
}

/** Inserta o reemplaza por `id`. Los nuevos van al inicio (`start`) o al final (`end`) de la lista. */
function upsertById<T extends { id: string }>(list: T[], item: T, position: 'start' | 'end'): T[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx >= 0) {
    const updated = [...list];
    updated[idx] = item;
    return updated;
  }
  return position === 'start' ? [item, ...list] : [...list, item];
}

function removeById<T extends { id: string }>(list: T[], id: string): T[] {
  return list.filter((x) => x.id !== id);
}

// Activities
export function getActivities(): ActivityItem[] {
  return safeGet<ActivityItem[]>(STORAGE_KEYS.ACTIVITIES, INITIAL_ACTIVITIES);
}

export function saveActivity(activity: ActivityItem): ActivityItem[] {
  const updated = upsertById(getActivities(), activity, 'start');
  safeSet(STORAGE_KEYS.ACTIVITIES, updated);
  return updated;
}

export function deleteActivity(id: string): ActivityItem[] {
  const updated = removeById(getActivities(), id);
  safeSet(STORAGE_KEYS.ACTIVITIES, updated);
  return updated;
}

export function updateActivityStatus(
  id: string,
  status: ActivityItem['status'],
  cancellationReason?: string
): ActivityItem[] {
  const current = getActivities();
  const exists = current.findIndex((a) => a.id === id);
  if (exists < 0) return current;
  const updated = [...current];
  updated[exists] = {
    ...updated[exists],
    status,
    ...(cancellationReason !== undefined ? { cancellationReason } : {}),
    statusUpdatedAt: new Date().toISOString(),
  };
  safeSet(STORAGE_KEYS.ACTIVITIES, updated);
  return updated;
}

// News
export function getNews(): NewsItem[] {
  return safeGet<NewsItem[]>(STORAGE_KEYS.NEWS, INITIAL_NEWS);
}

export function saveNews(newsItem: NewsItem): NewsItem[] {
  const current = getNews();
  let updatedList = [...current];

  // Regla estricta: solo un comunicado puede estar en el aviso interno a la vez
  if (newsItem.isAnnouncement) {
    updatedList = updatedList.map((n) => ({
      ...n,
      isAnnouncement: n.id === newsItem.id,
    }));
  }

  updatedList = upsertById(updatedList, newsItem, 'start');
  safeSet(STORAGE_KEYS.NEWS, updatedList);
  return updatedList;
}

export function setAnnouncementNewsId(newsId: string | null): NewsItem[] {
  const current = getNews();
  const updated = current.map((n) => ({
    ...n,
    isAnnouncement: newsId ? n.id === newsId : false,
  }));
  safeSet(STORAGE_KEYS.NEWS, updated);
  return updated;
}

export function deleteNews(id: string): NewsItem[] {
  const updated = removeById(getNews(), id);
  safeSet(STORAGE_KEYS.NEWS, updated);
  return updated;
}

// Courses
export function getCourses(): TrainingCourse[] {
  return safeGet<TrainingCourse[]>(STORAGE_KEYS.COURSES, INITIAL_COURSES);
}

export function saveCourse(course: TrainingCourse): TrainingCourse[] {
  const updated = upsertById(getCourses(), course, 'start');
  safeSet(STORAGE_KEYS.COURSES, updated);
  return updated;
}

export function deleteCourse(id: string): TrainingCourse[] {
  const updated = removeById(getCourses(), id);
  safeSet(STORAGE_KEYS.COURSES, updated);
  return updated;
}

// Programs
export function getPrograms(): ProjectProgram[] {
  return safeGet<ProjectProgram[]>(STORAGE_KEYS.PROGRAMS, INITIAL_PROGRAMS);
}

export function saveProgram(program: ProjectProgram): ProjectProgram[] {
  const updated = upsertById(getPrograms(), program, 'end');
  safeSet(STORAGE_KEYS.PROGRAMS, updated);
  return updated;
}

export function deleteProgram(id: string): ProjectProgram[] {
  const updated = removeById(getPrograms(), id);
  safeSet(STORAGE_KEYS.PROGRAMS, updated);
  return updated;
}

export function getResources(): ResourceDocument[] {
  const stored = safeGet<ResourceDocument[]>(STORAGE_KEYS.RESOURCES, INITIAL_RESOURCES);
  const deletedIds = safeGet<string[]>(STORAGE_KEYS.DELETED_RESOURCES, []);
  const initialMap = new Map(INITIAL_RESOURCES.map((r) => [r.id, r]));
  const merged = stored.map((item) => {
    const init = initialMap.get(item.id);
    if (init && !item.contentTemplate && init.contentTemplate) {
      return { ...item, contentTemplate: init.contentTemplate };
    }
    return item;
  });
  for (const init of INITIAL_RESOURCES) {
    if (!deletedIds.includes(init.id) && !merged.some((m) => m.id === init.id)) {
      merged.push(init);
    }
  }
  return merged;
}

export function saveResource(resDoc: ResourceDocument): ResourceDocument[] {
  const updated = upsertById(getResources(), resDoc, 'start');
  safeSet(STORAGE_KEYS.RESOURCES, updated);
  // If previously deleted, unmark it
  const deletedIds = safeGet<string[]>(STORAGE_KEYS.DELETED_RESOURCES, []);
  if (deletedIds.includes(resDoc.id)) {
    safeSet(
      STORAGE_KEYS.DELETED_RESOURCES,
      deletedIds.filter((id) => id !== resDoc.id)
    );
  }
  return updated;
}

export function deleteResource(id: string): ResourceDocument[] {
  const updated = removeById(getResources(), id);
  safeSet(STORAGE_KEYS.RESOURCES, updated);

  const deletedIds = safeGet<string[]>(STORAGE_KEYS.DELETED_RESOURCES, []);
  if (!deletedIds.includes(id)) {
    safeSet(STORAGE_KEYS.DELETED_RESOURCES, [...deletedIds, id]);
  }
  return updated;
}

// Quick Links
export function getQuickLinks(): QuickLink[] {
  return safeGet<QuickLink[]>(STORAGE_KEYS.LINKS, INITIAL_LINKS);
}

export function saveQuickLink(link: QuickLink): QuickLink[] {
  const updated = upsertById(getQuickLinks(), link, 'end');
  safeSet(STORAGE_KEYS.LINKS, updated);
  return updated;
}

export function deleteQuickLink(id: string): QuickLink[] {
  const updated = removeById(getQuickLinks(), id);
  safeSet(STORAGE_KEYS.LINKS, updated);
  return updated;
}

// Team
export function getTeam(): TeamMember[] {
  return safeGet<TeamMember[]>(STORAGE_KEYS.TEAM, INITIAL_TEAM);
}

export function saveTeamMember(member: TeamMember): TeamMember[] {
  const updated = upsertById(getTeam(), member, 'end');
  safeSet(STORAGE_KEYS.TEAM, updated);
  return updated;
}

export function deleteTeamMember(id: string): TeamMember[] {
  const updated = removeById(getTeam(), id);
  safeSet(STORAGE_KEYS.TEAM, updated);
  return updated;
}

// Institute Area Cards (Cards de la sección Instituto)
export function getInstituteAreas(): InstituteAreaCard[] {
  const items = safeGet<InstituteAreaCard[]>(STORAGE_KEYS.AREAS, INITIAL_INSTITUTE_AREAS);
  return [...items].sort((a, b) => (a.order || 0) - (b.order || 0));
}

export function saveInstituteAreas(areas: InstituteAreaCard[]): InstituteAreaCard[] {
  const normalized = areas.map((a, idx) => ({ ...a, order: a.order ?? idx + 1 }));
  safeSet(STORAGE_KEYS.AREAS, normalized);
  return normalized.sort((a, b) => a.order - b.order);
}

export function saveInstituteArea(area: InstituteAreaCard): InstituteAreaCard[] {
  const current = getInstituteAreas();
  const withoutItem = current.filter((a) => a.id !== area.id);
  const targetPos = Math.max(1, Math.min(area.order || (withoutItem.length + 1), withoutItem.length + 1));
  withoutItem.splice(targetPos - 1, 0, { ...area, order: targetPos });
  const reindexed = withoutItem.map((card, idx) => ({ ...card, order: idx + 1 }));
  return saveInstituteAreas(reindexed);
}

export function deleteInstituteArea(id: string): InstituteAreaCard[] {
  const current = getInstituteAreas();
  const updated = current.filter((a) => a.id !== id);
  const reindexed = updated.map((card, idx) => ({ ...card, order: idx + 1 }));
  return saveInstituteAreas(reindexed);
}

export function reorderInstituteArea(id: string, targetPosition: number): InstituteAreaCard[] {
  const current = getInstituteAreas();
  const index = current.findIndex((a) => a.id === id);
  if (index < 0) return current;

  const item = current[index];
  const remaining = current.filter((a) => a.id !== id);
  const clampedTarget = Math.max(0, Math.min(targetPosition - 1, remaining.length));

  remaining.splice(clampedTarget, 0, item);
  const reindexed = remaining.map((card, idx) => ({
    ...card,
    order: idx + 1,
  }));
  return saveInstituteAreas(reindexed);
}

export function resetInstituteAreas(): InstituteAreaCard[] {
  safeSet(STORAGE_KEYS.AREAS, INITIAL_INSTITUTE_AREAS);
  return INITIAL_INSTITUTE_AREAS;
}

// Institutional Settings & Metric Goals
export interface MetricGoalSettings {
  period: 'anual' | 'mensual'; // Periodo del objetivo de carga
  metricType: 'agentes' | 'visitas'; // Métrica a representar en la barra de carga principal elegida por el administrador
  targetAgentes: number; // Ej. 1750 anual o 150 mensual
  targetVisitas: number;  // Ej. 35 anual o 5 mensual
}

export const DEFAULT_GOAL_SETTINGS: MetricGoalSettings = {
  period: 'anual',
  metricType: 'agentes',
  targetAgentes: 1750,
  targetVisitas: 35,
};

export interface EthicalPrincipleItem {
  title: string;
  desc: string;
}

export interface InstitutionalSettings {
  instituteName: string;
  institutionSubtitle: string;
  address: string;
  city?: string;
  contactEmail: string;
  phone?: string;
  receptionExtension: string;
  techSupportExtension: string;
  operatingHours: string;
  announcementText?: string;
  isAnnouncementActive?: boolean;
  metricGoal?: MetricGoalSettings;
  copyrightText?: string;
  description?: string;

  // Pilares institucionales de la sección Instituto
  missionTag?: string;
  missionTitle?: string;
  missionText?: string;

  objectivesTag?: string;
  objectivesTitle?: string;
  objectivesList?: string[];

  principlesTag?: string;
  principlesTitle?: string;
  principlesList?: EthicalPrincipleItem[];
}

export const DEFAULT_SETTINGS: InstitutionalSettings = {
  instituteName: 'Instituto de Capacitación y Gestión Pública',
  institutionSubtitle: 'Poder Legislativo',
  address: 'Palacio Legislativo - Anexo Rivadavia, Av. Rivadavia 1864, Piso 3°',
  city: 'Ciudad Autónoma de Buenos Aires',
  contactEmail: 'contacto@instituto.legislatura.gob.ar',
  phone: 'Conmutador: (011) 4370-7100',
  receptionExtension: 'int. 4022',
  techSupportExtension: 'int. 4108',
  operatingHours: 'Lunes a Viernes de 08:00 a 18:00 hs',
  announcementText: 'Período lectivo y calendario de visitas escolares en curso.',
  isAnnouncementActive: false,
  metricGoal: DEFAULT_GOAL_SETTINGS,
  copyrightText: 'Todos los derechos reservados.',
  description: 'Plataforma de coordinación pedagógica, extensión cívica y administración de expedientes formativos para agentes parlamentarios.',

  missionTag: 'PROPÓSITO PERMANENTE',
  missionTitle: 'Misión Institucional',
  missionText: 'Capacitar, profesionalizar y brindar asistencia técnica a los cuadros parlamentarios y administrativos de la Cámara, garantizando excelencia técnica, rigor normativo y vocación de servicio republicano.',

  objectivesTag: 'METAS ESTRATÉGICAS',
  objectivesTitle: 'Objetivos de Gestión',
  objectivesList: [
    'Fortalecer la técnica legislativa y redacción de normas claras.',
    'Impulsar la innovación tecnológica y adopción ética de IA.',
    'Promover cultura cívica en jóvenes mediante visitas guiadas.',
    'Garantizar transparencia y acceso a la información pública.',
  ],

  principlesTag: 'MARCO ÉTICO',
  principlesTitle: 'Principios Rectores',
  principlesList: [
    { title: 'Pluralismo', desc: 'Formación transversal para todos los bloques.' },
    { title: 'Rigor Académico', desc: 'Contenidos actualizados con docentes expertos.' },
    { title: 'Compromiso Democrático', desc: 'Apego irrestricto a la Constitución.' },
  ],
};

export function getInstitutionalSettings(): InstitutionalSettings {
  const current = safeGet<InstitutionalSettings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
  return {
    ...DEFAULT_SETTINGS,
    ...current,
    objectivesList:
      current?.objectivesList && Array.isArray(current.objectivesList) && current.objectivesList.length > 0
        ? current.objectivesList
        : DEFAULT_SETTINGS.objectivesList,
    principlesList:
      current?.principlesList && Array.isArray(current.principlesList) && current.principlesList.length > 0
        ? current.principlesList
        : DEFAULT_SETTINGS.principlesList,
    metricGoal: {
      ...DEFAULT_GOAL_SETTINGS,
      ...(current?.metricGoal || {}),
    },
  };
}

export function saveInstitutionalSettings(settings: InstitutionalSettings): InstitutionalSettings {
  const normalized: InstitutionalSettings = {
    ...DEFAULT_SETTINGS,
    ...settings,
    instituteName: settings.instituteName?.trim() || DEFAULT_SETTINGS.instituteName,
    institutionSubtitle: settings.institutionSubtitle?.trim() || DEFAULT_SETTINGS.institutionSubtitle,
    address: settings.address?.trim() || DEFAULT_SETTINGS.address,
    contactEmail: settings.contactEmail?.trim() || DEFAULT_SETTINGS.contactEmail,
    missionTag: settings.missionTag?.trim() || DEFAULT_SETTINGS.missionTag,
    missionTitle: settings.missionTitle?.trim() || DEFAULT_SETTINGS.missionTitle,
    missionText: settings.missionText?.trim() || DEFAULT_SETTINGS.missionText,
    objectivesTag: settings.objectivesTag?.trim() || DEFAULT_SETTINGS.objectivesTag,
    objectivesTitle: settings.objectivesTitle?.trim() || DEFAULT_SETTINGS.objectivesTitle,
    objectivesList: Array.isArray(settings.objectivesList) && settings.objectivesList.length > 0
      ? settings.objectivesList
      : DEFAULT_SETTINGS.objectivesList,
    principlesTag: settings.principlesTag?.trim() || DEFAULT_SETTINGS.principlesTag,
    principlesTitle: settings.principlesTitle?.trim() || DEFAULT_SETTINGS.principlesTitle,
    principlesList: Array.isArray(settings.principlesList) && settings.principlesList.length > 0
      ? settings.principlesList
      : DEFAULT_SETTINGS.principlesList,
  };
  safeSet(STORAGE_KEYS.SETTINGS, normalized);
  return normalized;
}

// Reset data
export function resetAllData(): void {
  if (typeof window === 'undefined') return;
  Object.values(STORAGE_KEYS).forEach((k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      // Ignore
    }
  });
  notifyStorageChanged('icl_intranet_reset');
  publishInitialStateToSharedBackend();
}

/**
 * Publica los datos iniciales (de lib/mock-data.ts) en el backend compartido.
 * La escritura remota reemplaza TODA la colección, con lo cual un Reset también
 * es válido entre dispositivos ( Firestore queda en el estado inicial del Instituto).
 */
function publishInitialStateToSharedBackend(): void {
  ensureBackendSync();
  if (!getIntranetDb()) return;
  const idOf = (item: Record<string, unknown>): string => String(item?.id ?? '');
  const collectionSeeds: [string, unknown[]][] = [
    [COLLECTION_BY_KEY[STORAGE_KEYS.ACTIVITIES], INITIAL_ACTIVITIES],
    [COLLECTION_BY_KEY[STORAGE_KEYS.NEWS], INITIAL_NEWS],
    [COLLECTION_BY_KEY[STORAGE_KEYS.COURSES], INITIAL_COURSES],
    [COLLECTION_BY_KEY[STORAGE_KEYS.PROGRAMS], INITIAL_PROGRAMS],
    [COLLECTION_BY_KEY[STORAGE_KEYS.RESOURCES], INITIAL_RESOURCES],
    [COLLECTION_BY_KEY[STORAGE_KEYS.LINKS], INITIAL_LINKS],
    [COLLECTION_BY_KEY[STORAGE_KEYS.TEAM], INITIAL_TEAM],
    [COLLECTION_BY_KEY[STORAGE_KEYS.AREAS], INITIAL_INSTITUTE_AREAS],
    [COLLECTION_BY_KEY[STORAGE_KEYS.COURSE_AUDITS], INITIAL_COURSE_AUDITS],
  ];
  collectionSeeds.forEach(([name, items]) => {
    void replaceCollection(
      name,
      items.map((i) => i as unknown as Record<string, unknown>),
      idOf
    );
  });
  void pushSingleDoc(META_DOC_PATHS[STORAGE_KEYS.SETTINGS][0], META_DOC_PATHS[STORAGE_KEYS.SETTINGS][1], DEFAULT_SETTINGS);
  void pushSingleDoc(
    META_DOC_PATHS[STORAGE_KEYS.DELETED_RESOURCES][0],
    META_DOC_PATHS[STORAGE_KEYS.DELETED_RESOURCES][1],
    { deletedResourceIds: [] }
  );
}

// Course Audits & Reading Checklists (Control Anti-Fraude de Cursada)
export function getCourseAudits(): AgentCourseAudit[] {
  const loaded = safeGet<AgentCourseAudit[]>(STORAGE_KEYS.COURSE_AUDITS, INITIAL_COURSE_AUDITS);
  // Sanitize any existing cached verdicts to ensure no raw emojis are displayed
  return loaded.map((a) => ({
    ...a,
    auditVerdict: (a.auditVerdict || '').replace(/^[✅⚠️⏳]\s*/, ''),
  }));
}

export function saveCourseAudits(audits: AgentCourseAudit[]): AgentCourseAudit[] {
  const cleaned = audits.map((a) => ({
    ...a,
    auditVerdict: (a.auditVerdict || '').replace(/^[✅⚠️⏳]\s*/, ''),
  }));
  safeSet(STORAGE_KEYS.COURSE_AUDITS, cleaned);
  return cleaned;
}

export function toggleCourseModuleCheck(
  course: TrainingCourse,
  unitIndex: number,
  user: { displayName?: string; email?: string }
): { updatedAudit: AgentCourseAudit; allAudits: AgentCourseAudit[] } {
  const currentAudits = getCourseAudits();
  const userEmail = (user.email || 'agente.intranet@legislatura.gob.ar').toLowerCase().trim();
  const userName = user.displayName || 'Agente Legislativo';

  // Find or create the audit record for this user and course
  let auditIndex = currentAudits.findIndex(
    (a) => a.courseId === course.id && a.agentEmail.toLowerCase().trim() === userEmail
  );

  let audit: AgentCourseAudit;
  const totalUnits = course.syllabus?.length || 4;

  if (auditIndex < 0) {
    audit = {
      id: generateId('audit'),
      courseId: course.id,
      courseTitle: course.title,
      durationHours: course.durationHours,
      agentName: userName,
      agentEmail: userEmail,
      agentArea: 'Poder Legislativo',
      checks: [],
      totalModules: totalUnits,
      completedModulesCount: 0,
      isFullyCompleted: false,
      timeDeltaMinutes: 0,
      auditStatus: 'en_progreso',
      auditVerdict: `Cursada iniciada. 0 de ${totalUnits} módulos completados.`,
    };
  } else {
    audit = { ...currentAudits[auditIndex] };
  }

  // Integridad del certificado: una cursada ya homologada por Administración no puede ser
  // modificada por el agente (antes, al destildar un módulo se perdía el estado "aprobado" pero
  // quedaba la fecha de certificación). Si fue observada, solo Administración puede reabrirla.
  if (audit.auditStatus === 'aprobado_admin' || audit.auditStatus === 'observado') {
    return { updatedAudit: audit, allAudits: currentAudits };
  }

  const existingCheckIdx = audit.checks.findIndex((c) => c.unitIndex === unitIndex);
  const now = Date.now();
  const formattedDate = new Date().toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  if (existingCheckIdx >= 0) {
    // Uncheck
    audit.checks = audit.checks.filter((c) => c.unitIndex !== unitIndex);
  } else {
    // Check
    const newCheck: CourseModuleCheck = {
      unitIndex,
      unitTitle: course.syllabus?.[unitIndex] || `Módulo ${unitIndex + 1}`,
      completedAt: formattedDate,
      timestamp: now,
    };
    audit.checks = [...audit.checks, newCheck].sort((a, b) => a.timestamp - b.timestamp);
  }

  audit.completedModulesCount = audit.checks.length;
  audit.totalModules = totalUnits;
  audit.isFullyCompleted = audit.completedModulesCount >= totalUnits;

  if (audit.checks.length > 0) {
    const timestamps = audit.checks.map((c) => c.timestamp);
    audit.firstCheckTimestamp = Math.min(...timestamps);
    audit.lastCheckTimestamp = Math.max(...timestamps);
    audit.timeDeltaMinutes = Math.max(0, Math.round((audit.lastCheckTimestamp - audit.firstCheckTimestamp) / 60000));
  } else {
    audit.firstCheckTimestamp = undefined;
    audit.lastCheckTimestamp = undefined;
    audit.timeDeltaMinutes = 0;
  }

  // Audit logic: Check for simultaneous burst vs consistent spaced reading
  if (audit.isFullyCompleted) {
    // If course is 10 hours or more, but all units were checked in less than 5 minutes
    if (course.durationHours >= 10 && audit.timeDeltaMinutes < 5) {
      audit.auditStatus = 'alerta_simultanea';
      audit.auditVerdict = `ALERTA: Checks Simultáneos Detectados. Marcó los ${totalUnits} módulos en ${
        audit.timeDeltaMinutes < 1 ? 'menos de 1 minuto' : `${audit.timeDeltaMinutes} minutos`
      } para un curso de ${course.durationHours} hs lectivas. Posible omisión de material en Drive.`;
    } else {
      audit.auditStatus = 'consistente';
      const hoursDiff = Math.round(audit.timeDeltaMinutes / 60);
      audit.auditVerdict = `Cursada Consistente: Módulos espaciados temporalmente (${
        hoursDiff >= 1 ? `${hoursDiff} hs` : `${audit.timeDeltaMinutes} min`
      } entre primer y último módulo).`;
    }
  } else {
    audit.auditStatus = 'en_progreso';
    audit.auditVerdict = `En progreso: ${audit.completedModulesCount} de ${totalUnits} módulos completados.`;
  }

  let updatedList: AgentCourseAudit[];
  if (auditIndex < 0) {
    updatedList = [audit, ...currentAudits];
  } else {
    updatedList = [...currentAudits];
    updatedList[auditIndex] = audit;
  }

  saveCourseAudits(updatedList);
  return { updatedAudit: audit, allAudits: updatedList };
}

export function adminApproveCourseAudit(auditId: string): AgentCourseAudit[] {
  const current = getCourseAudits();
  const formattedToday = new Date().toLocaleDateString('es-AR');
  const updated = current.map((a) => {
    if (a.id === auditId) {
      // Solo se puede homologar si el agente completó el 100% del temario
      if (!a.isFullyCompleted && a.completedModulesCount < a.totalModules) {
        return a;
      }
      return {
        ...a,
        auditStatus: 'aprobado_admin' as const,
        certifiedAt: formattedToday,
        adminNotes: `Aprobado por Administración el ${formattedToday}. Certificado oficial emitido.`,
      };
    }
    return a;
  });
  return saveCourseAudits(updated);
}

export function adminObserveCourseAudit(auditId: string, notes?: string): AgentCourseAudit[] {
  const current = getCourseAudits();
  const updated = current.map((a) => {
    if (a.id === auditId) {
      return {
        ...a,
        auditStatus: 'observado' as const,
        certifiedAt: undefined,
        adminNotes: notes || 'Observado por inconsistencia en tiempos de cursada. Se requiere verificación de lectura.',
      };
    }
    return a;
  });
  return saveCourseAudits(updated);
}

export function adminResetCourseAudit(auditId: string): AgentCourseAudit[] {
  const current = getCourseAudits();
  const updated = current.map((a) => {
    if (a.id === auditId) {
      return {
        ...a,
        checks: [],
        completedModulesCount: 0,
        isFullyCompleted: false,
        auditStatus: 'en_progreso' as const,
        auditVerdict: 'Cursada reiniciada por el Administrador para verificación integral de lectura.',
        certifiedAt: undefined,
        csatRating: undefined,
        csatComment: undefined,
        adminNotes: 'Cursada reiniciada por auditoría. El agente debe reiniciar las lecturas.',
      };
    }
    return a;
  });
  return saveCourseAudits(updated);
}

export function adminDeleteCourseAudit(auditId: string): AgentCourseAudit[] {
  const current = getCourseAudits();
  const updated = current.filter((a) => a.id !== auditId);
  return saveCourseAudits(updated);
}

export function submitAuditCsat(
  auditId: string,
  rating: 'Muy Satisfecho' | 'Satisfecho' | 'Neutral' | 'Insatisfecho',
  comment?: string
): AgentCourseAudit[] {
  const current = getCourseAudits();
  const updated = current.map((a) => {
    if (a.id === auditId) {
      return {
        ...a,
        csatRating: rating,
        csatComment: comment || '',
      };
    }
    return a;
  });
  return saveCourseAudits(updated);
}

export interface CourseCsatStats {
  /** false cuando todavía no hay encuestas: los valores numéricos son 0 y la UI debe mostrar "sin datos". */
  hasData: boolean;
  csatPercentage: number;
  totalEvaluations: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  averageRating5: number;
  distribution: {
    muySatisfecho: number;
    satisfecho: number;
    neutral: number;
    insatisfecho: number;
  };
  recentComments: { agentName: string; courseTitle: string; rating: string; comment: string }[];
}

/**
 * Calculates official CSAT (Customer/Agent Satisfaction Score) for training courses.
 * Industry standard CSAT: % of positive responses ('Muy Satisfecho' + 'Satisfecho') over total respondents.
 */
export function getCourseCsatStats(): CourseCsatStats {
  const audits = getCourseAudits();
  // Los registros de ejemplo (isSample) nunca cuentan en una métrica real.
  const rated = audits.filter((a) => a.csatRating && !a.isSample);

  if (rated.length === 0) {
    // Antes se devolvía un 96 % / 4,8 inventado como si fuera una medición real.
    return {
      hasData: false,
      csatPercentage: 0,
      totalEvaluations: 0,
      positiveCount: 0,
      neutralCount: 0,
      negativeCount: 0,
      averageRating5: 0,
      distribution: { muySatisfecho: 0, satisfecho: 0, neutral: 0, insatisfecho: 0 },
      recentComments: [],
    };
  }

  let positive = 0;
  let neutral = 0;
  let negative = 0;
  let scoreSum = 0;
  const dist = { muySatisfecho: 0, satisfecho: 0, neutral: 0, insatisfecho: 0 };
  const comments: { agentName: string; courseTitle: string; rating: string; comment: string }[] = [];

  rated.forEach((a) => {
    if (a.csatRating === 'Muy Satisfecho') {
      positive++;
      scoreSum += 5;
      dist.muySatisfecho++;
    } else if (a.csatRating === 'Satisfecho') {
      positive++;
      scoreSum += 4;
      dist.satisfecho++;
    } else if (a.csatRating === 'Neutral') {
      neutral++;
      scoreSum += 3;
      dist.neutral++;
    } else if (a.csatRating === 'Insatisfecho') {
      negative++;
      scoreSum += 2;
      dist.insatisfecho++;
    }

    if (a.csatComment && a.csatComment.trim()) {
      comments.push({
        agentName: a.agentName,
        courseTitle: a.courseTitle,
        rating: a.csatRating || 'Muy Satisfecho',
        comment: a.csatComment.trim(),
      });
    }
  });

  const pct = Math.round((positive / rated.length) * 100);
  const avg = Number((scoreSum / rated.length).toFixed(1));

  return {
    hasData: true,
    csatPercentage: pct,
    totalEvaluations: rated.length,
    positiveCount: positive,
    neutralCount: neutral,
    negativeCount: negative,
    averageRating5: avg,
    distribution: dist,
    recentComments: comments,
  };
}

// Backup & Restore
const BACKUP_VERSION = '1.3';
const MAX_IMPORT_CHARS = 8 * 1024 * 1024;

export function exportAllData(): string {
  return JSON.stringify(
    {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      activities: getActivities(),
      news: getNews(),
      courses: getCourses(),
      programs: getPrograms(),
      resources: getResources(),
      deletedResources: safeGet<string[]>(STORAGE_KEYS.DELETED_RESOURCES, []),
      links: getQuickLinks(),
      team: getTeam(),
      areas: getInstituteAreas(),
      settings: getInstitutionalSettings(),
      courseAudits: getCourseAudits(),
    },
    null,
    2
  );
}

export interface ImportResult {
  ok: boolean;
  /** Motivo legible cuando `ok` es false. */
  error?: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Cada elemento de una colección debe ser un objeto con `id` de texto (la base de todos los CRUD). */
function isValidCollection(v: unknown): v is { id: string }[] {
  return (
    Array.isArray(v) &&
    v.every((item) => isRecord(item) && typeof item.id === 'string' && item.id.length > 0 && item.id.length < 200)
  );
}

/**
 * Importa una copia de seguridad de forma ATÓMICA: primero valida todo, luego escribe, y si
 * alguna escritura falla (cuota llena) restaura el estado anterior. Antes se escribía por
 * partes, se ignoraban los errores y se informaba "éxito" aunque los datos quedaran a medias.
 */
export function importAllDataDetailed(jsonStr: string): ImportResult {
  if (typeof window === 'undefined') return { ok: false, error: 'La importación solo funciona en el navegador.' };
  if (typeof jsonStr !== 'string' || jsonStr.length > MAX_IMPORT_CHARS) {
    return { ok: false, error: 'El archivo es demasiado grande para importarse.' };
  }

  let data: unknown;
  try {
    data = JSON.parse(jsonStr);
  } catch {
    return { ok: false, error: 'El archivo no es un JSON válido.' };
  }
  if (!isRecord(data)) return { ok: false, error: 'El archivo no tiene el formato de una copia de seguridad.' };

  const collections: [string, string][] = [
    ['activities', STORAGE_KEYS.ACTIVITIES],
    ['news', STORAGE_KEYS.NEWS],
    ['courses', STORAGE_KEYS.COURSES],
    ['programs', STORAGE_KEYS.PROGRAMS],
    ['resources', STORAGE_KEYS.RESOURCES],
    ['links', STORAGE_KEYS.LINKS],
    ['team', STORAGE_KEYS.TEAM],
    ['areas', STORAGE_KEYS.AREAS],
    ['courseAudits', STORAGE_KEYS.COURSE_AUDITS],
  ];

  const writes: [string, unknown][] = [];
  for (const [field, key] of collections) {
    if (data[field] === undefined) continue;
    if (!isValidCollection(data[field])) {
      return { ok: false, error: `La sección "${field}" está dañada o tiene registros sin identificador.` };
    }
    writes.push([key, data[field]]);
  }
  if (data.deletedResources !== undefined) {
    if (!Array.isArray(data.deletedResources) || !data.deletedResources.every((x) => typeof x === 'string')) {
      return { ok: false, error: 'La sección "deletedResources" está dañada.' };
    }
    writes.push([STORAGE_KEYS.DELETED_RESOURCES, data.deletedResources]);
  }
  if (data.settings !== undefined) {
    if (!isRecord(data.settings)) return { ok: false, error: 'La sección "settings" está dañada.' };
    writes.push([STORAGE_KEYS.SETTINGS, data.settings]);
  }
  if (writes.length === 0) {
    return { ok: false, error: 'El archivo no contiene datos de la intranet para importar.' };
  }

  // Instantánea para poder revertir.
  const snapshot = new Map<string, string | null>();
  for (const [key] of writes) {
    try {
      snapshot.set(key, localStorage.getItem(key));
    } catch {
      return { ok: false, error: 'No se pudo acceder al almacenamiento del navegador.' };
    }
  }

  try {
    for (const [key, value] of writes) {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (e) {
    console.error('Failed to import intranet data, rolling back:', e);
    for (const [key, previous] of snapshot) {
      try {
        if (previous === null) localStorage.removeItem(key);
        else localStorage.setItem(key, previous);
      } catch {
        // Ignore: se hizo lo posible por restaurar.
      }
    }
    return { ok: false, error: 'No hay espacio suficiente en el navegador para importar estos datos. No se modificó nada.' };
  }

  notifyStorageChanged('icl_intranet_import');
  // Publicar la importación en el backend compartido: el diff escribe lo que cambió
  // y el reemplazo refresca las colecciones cuyo contenido quedó en estado intermedio.
  ensureBackendSync();
  for (const [key, value] of writes) {
    pushRemoteUnlessSuppressed(key, value);
  }
  return { ok: true };
}

/** Versión booleana (compatibilidad con el código existente). */
export function importAllData(jsonStr: string): boolean {
  return importAllDataDetailed(jsonStr).ok;
}
