/**
 * Capa de acceso al backend compartido: Firebase Firestore.
 *
 * Responsabilidad única: ofrecer primitivas genéricas (suscripción, push con
 * deduplicación por diff, reemplazo completo de una colección) para que
 * `lib/storage.ts` (datos institucionales) y `lib/auth.ts` (usuarios
 * autorizados) las usen sin conocer Firestore.
 *
 * Modelo de datos:
 *  - Un documento por registro, con el mismo `id` del objeto como ID de doc.
 *  - Colecciones de solo lectura/escritura controladas por `firestore.rules`.
 *  - Última escritura gana (no hay control optimista de revisiones).
 *
 * Compatibilidad con SSR: todas las primitivas son no-op fuera del navegador.
 * Si Firestore no está disponible (sin app de Firebase, reglas que rechazan,
 * base de datos no creada), se emite FIRESTORE_ERROR_EVENT y el trabajo sigue
 * funcionando contra el almacenamiento local.
 */
import { getApp, getApps, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import defaultFirebaseConfig from '../firebase-applet-config.json';
import { changedFields, docHash, fieldHashes, type FieldHashes } from './sync-merge';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';

export const FIRESTORE_ERROR_EVENT = 'icl:firestore-error';
export const FIRESTORE_READY_EVENT = 'icl:firestore-ready';
export const FIRESTORE_DIAGNOSIS_EVENT = 'icl:firestore-diagnosis';

/** Colección de encuestas de satisfacción de visitas (creación anónima según reglas). */
export const VISIT_CSAT_COLLECTION = 'visit_csat';

/** Límite de tamaño por documento en Firestore: se rechaza con error si se excede. */
const MAX_DOC_BYTES = 1024 * 1024;
/** Firestore admite hasta 500 operaciones por lote; dejamos margen. */
const BATCH_MAX_OPS = 400;
/** Espera de re-suscripción de un listener que murió (reglas publicadas tarde, red). */
const LISTENER_RETRY_MS = 60_000;

let db: Firestore | null = null;
let readyReported = false;
let lastReportedError = '';
let lastReportedErrorAt = 0;
let appCheckInitialized = false;

/**
 * App Check (reCAPTCHA v3): attestation de que las requests vienen DE ESTA app web.
 * Complementa Security Rules para frenar scripts externos que golpearían Firestore
 * directamente con la API key pública (cuota/spam). Se activa SOLO si hay site key
 * configurada (firebase-applet-config.json: recaptchaSiteKey, o env NEXT_PUBLIC_APPCHECK_SITE_KEY);
 * la *aplicación obligatoria* (enforcement) se activa desde Firebase Console → App Check
 * después de revisar las métricas, según la guía oficial.
 */
function ensureAppCheck(): void {
  if (appCheckInitialized || typeof window === 'undefined') return;
  appCheckInitialized = true;
  try {
    const siteKey =
      (defaultFirebaseConfig.recaptchaSiteKey || '').trim() ||
      (process.env.NEXT_PUBLIC_APPCHECK_SITE_KEY || '').trim();
    if (!siteKey) return; // Sin clave: comportamiento anterior (App Check desactivado).
    initializeAppCheck(getApp(), {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (e) {
    console.warn('App Check no se pudo inicializar (función opcional):', e);
  }
}
/** Repite el MISMO aviso si pasan N ms (un push que sigue fallando NO debe quedar mudo,
 *  porque el usuario seguiría viendo "guardado con éxito" local sin saber que no se sincronizó). */
const REPEAT_SAME_ERROR_MS = 15_000;

/* ── Gate de sesión ──────────────────────────────────────────────────────────
 * Con reglas de producción, un listener abierto sin sesión (o sin permiso) no
 * solo falla: MUERE. Los datos quedarían sin sincronizar para siempre aunque el
 * usuario se loguee después. Por eso: sin sesión aprobada NO se abren listeners;
 * al loguear, `setFirestoreSyncGate(true)` re-abre todos (registrados abajo).
 */
let syncGateOpen = false;
const gateOpenHandlers: (() => void)[] = [];

/** Registra una función que re-crea los listeners (se llama al abrir el gate). */
export function registerGateOpenHandler(handler: () => void): void {
  if (!gateOpenHandlers.includes(handler)) gateOpenHandlers.push(handler);
}

export function isSyncGateOpen(): boolean {
  return syncGateOpen;
}

/**
 * Quién tiene la sesión abierta (lo fija lib/auth.ts junto con el gate). Algunas colecciones (course_audits)
 * solo se pueden leer filtradas por el propio email: con reglas de producción una consulta sin ese filtro
 * se rechaza entera.
 */
export interface SyncIdentity {
  email: string;
  isAdmin: boolean;
  /** uid de Firebase de la sesión (solo con sesión de Firebase; las cuentas institucionales no lo tienen). */
  uid?: string;
}
let syncIdentity: SyncIdentity | null = null;

export function setSyncIdentity(identity: SyncIdentity | null): void {
  syncIdentity = identity
    ? { email: identity.email.trim().toLowerCase(), isAdmin: identity.isAdmin, ...(identity.uid ? { uid: identity.uid } : {}) }
    : null;
}

export function getSyncIdentity(): SyncIdentity | null {
  return syncIdentity;
}

/** Abre/cierra el gate de sincronización (lo llama lib/auth.ts con la sesión real). */
export function setFirestoreSyncGate(open: boolean): void {
  syncGateOpen = open;
  gateOpenHandlers.forEach((h) => {
    try {
      h();
    } catch (e) {
      console.error('Error re-abriendo listeners de Firestore:', e);
    }
  });
}

function reportError(message: string): void {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  if (message === lastReportedError && now - lastReportedErrorAt < REPEAT_SAME_ERROR_MS) return;
  lastReportedError = message;
  lastReportedErrorAt = now;
  try {
    window.dispatchEvent(new CustomEvent(FIRESTORE_ERROR_EVENT, { detail: { message } }));
  } catch {
    // Ignore
  }
  console.error('Firestore:', message);
}

function reportReady(): void {
  if (readyReported) return;
  readyReported = true;
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new Event(FIRESTORE_READY_EVENT));
    } catch {
      // Ignore
    }
  }
}

/**
 * Devuelve la instancia de Firestore del proyecto o `null` si no está disponible.
 * Requiere que las apps de Firebase ya estén inicializadas (lo hace `lib/auth.ts`
 * al importarse); si no, devuelve null y el llamador puede reintentar más tarde.
 */
export function getIntranetDb(): Firestore | null {
  if (typeof window === 'undefined') return null;
  if (db) return db;
  try {
    if (getApps().length === 0) return null;
    ensureAppCheck();
    db = getFirestore(getApp());
    return db;
  } catch (e) {
    db = null;
    reportError('No se pudo inicializar Firestore. Los datos solo se guardan en este navegador.');
    return null;
  }
}

/**
 * Igual que getIntranetDb, pero inicializa la app de Firebase si aún no existe
 * (páginas públicas fuera del shell de la app, ej. la encuesta /encuesta/[token]).
 * Usa la MISMA configuración que la autenticación (getEffectiveFirebaseConfig).
 */
export async function ensureFirestoreReady(): Promise<Firestore | null> {
  const database = getIntranetDb();
  if (database) return database;
  if (typeof window === 'undefined') return null;
  try {
    const { initializeApp } = await import('firebase/app');
    const { getEffectiveFirebaseConfig } = await import('./auth');
    if (getApps().length === 0) {
      initializeApp(getEffectiveFirebaseConfig().config);
    }
    ensureAppCheck();
    db = getFirestore(getApp());
    return db;
  } catch (e) {
    db = null;
    console.error('No se pudo inicializar Firebase para la página pública:', e);
    reportError('No se pudo inicializar Firebase. Intentalo nuevamente en unos minutos.');
    return null;
  }
}

/** TRUE si la instancia quedó lista al menos una vez en esta sesión. */
export function isSharedBackendReady(): boolean {
  return readyReported && db !== null;
}

export function ensureFirebaseApp(): FirebaseApp | null {
  if (typeof window === 'undefined') return null;
  const apps = getApps();
  return apps.length > 0 ? apps[0] : null;
}

/* ────────────────────────── Estado interno para diffs ────────────────────────── */

/**
 * Claves cuyo último push FALLÓ (ej. Security Rules sin publicar). Mientras exista falla,
 * la data local (más reciente y del usuario) no se ve revertida por snapshots viejos.
 * Se limpia al primer push exitoso.
 */
const failedPushes = new Map<string, number>();

/** Reintentos programados de pushes que fallaron (por clave). */
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** Espera antes del reintento automático (cubre reglas recién publicadas / red inestable). */
const PUSH_RETRY_DELAY_MS = 90_000;

/** Programa un reintento del push fallido (uno solo pendiente por clave). */
function schedulePushRetry(key: string, op: () => Promise<unknown>): void {
  if (retryTimers.has(key)) return;
  const timer = setTimeout(() => {
    retryTimers.delete(key);
    void op();
  }, PUSH_RETRY_DELAY_MS);
  retryTimers.set(key, timer);
}

function cancelPushRetry(key: string): void {
  const timer = retryTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    retryTimers.delete(key);
  }
}

export function hasActivePushFailure(key: string): boolean {
  return failedPushes.has(key);
}

/**
 * Los envíos fallidos de DOCUMENTOS INDIVIDUALES (clave "coleccion/documento", ej. settings/app) se
 * recuerdan entre recargas: si no, un cambio que no llegó a Firestore se pisaría con la copia
 * remota al volver a abrir la página. Las colecciones no lo necesitan: se deducen comparando la
 * copia local con el último estado sincronizado (ver lib/sync-merge.ts).
 */
const DIRTY_STORAGE_KEY = 'icl_intranet_sync_dirty_v1';
/** Claves con un envío fallido de una sesión ANTERIOR, todavía sin reintentar. */
const staleFailures = new Set<string>();

function persistDirtyKeys(): void {
  if (typeof window === 'undefined') return;
  try {
    const keys = [...failedPushes.keys()].filter((k) => k.includes('/'));
    if (keys.length === 0) localStorage.removeItem(DIRTY_STORAGE_KEY);
    else localStorage.setItem(DIRTY_STORAGE_KEY, JSON.stringify(keys));
  } catch {
    // Sin almacenamiento disponible: queda solo el recordatorio en memoria.
  }
}

function restoreDirtyKeys(): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(DIRTY_STORAGE_KEY);
    const keys: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(keys)) return;
    for (const k of keys) {
      if (typeof k === 'string' && k.includes('/')) {
        failedPushes.set(k, 0);
        staleFailures.add(k);
      }
    }
  } catch {
    // Dato dañado: se ignora.
  }
}
restoreDirtyKeys();

/** TRUE (una sola vez) si el envío de `key` falló en una sesión anterior: hay que reintentarlo ahora. */
export function consumeStaleFailure(key: string): boolean {
  return staleFailures.delete(key);
}

function markPushFailure(key: string): void {
  failedPushes.set(key, Date.now());
  staleFailures.delete(key);
  if (key.includes('/')) persistDirtyKeys();
}

function clearPushFailure(key: string): void {
  failedPushes.delete(key);
  staleFailures.delete(key);
  if (key.includes('/')) persistDirtyKeys();
}

/**
 * DOCUMENTOS INDIVIDUALES: huella de cada CAMPO del último contenido SINCRONIZADO (local == servidor) de
 * cada documento, guardada en localStorage. Con ella, tras una recarga se detecta qué campos tienen un
 * cambio que Firestore todavía no recibió (por ejemplo, un guardado sin conexión) y no se los pisa con la
 * versión remota; y cada guardado envía solo los campos que cambiaron (ver `lib/sync-merge.ts`).
 */
const SINGLE_KNOWN_STORAGE_KEY = 'icl_intranet_sync_doc_fields_v1';

function readSingleKnown(): Record<string, FieldHashes> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SINGLE_KNOWN_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, FieldHashes> = {};
    for (const [docKey, fields] of Object.entries(parsed as Record<string, unknown>)) {
      if (!fields || typeof fields !== 'object' || Array.isArray(fields)) continue;
      const clean: FieldHashes = {};
      for (const [f, h] of Object.entries(fields as Record<string, unknown>)) {
        if (typeof h === 'string') clean[f] = h;
      }
      out[docKey] = clean;
    }
    return out;
  } catch {
    return {};
  }
}

function getSingleKnown(key: string): FieldHashes | null {
  return readSingleKnown()[key] ?? null;
}

function setSingleKnown(key: string, fields: FieldHashes): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SINGLE_KNOWN_STORAGE_KEY, JSON.stringify({ ...readSingleKnown(), [key]: fields }));
  } catch {
    // Sin almacenamiento disponible: se pierde solo la protección tras una recarga.
  }
}

/** Último valor que se quiso publicar de cada documento: un reintento envía el actual, no uno ya viejo. */
const latestSingleValue = new Map<string, unknown>();

/**
 * Por colección: huella (hash) de cada documento en el último estado SINCRONIZADO (local == servidor),
 * para calcular qué documentos cambiaron y no reescribir todo a Firestore. Con `persistKey` ese
 * estado también se guarda en localStorage, de modo que sobreviva a una recarga y permita detectar
 * borrados remotos y cambios locales sin enviar (ver lib/sync-merge.ts).
 */
interface CollectionTracker {
  known: Map<string, string>;
  bootstrapped: boolean;
  /** TRUE cuando `known` refleja un estado confirmado con el servidor (snapshot o envío exitoso). */
  synced: boolean;
  /** Clave de localStorage de la copia local de esta colección (null: no se persiste el estado). */
  persistKey: string | null;
}

const KNOWN_STORAGE_PREFIX = 'icl_intranet_sync_known_v1:';

const trackers = new Map<string, CollectionTracker>();

function getTracker(name: string): CollectionTracker {
  let t = trackers.get(name);
  if (!t) {
    t = { known: new Map(), bootstrapped: false, synced: false, persistKey: null };
    trackers.set(name, t);
  }
  return t;
}

/** Activa la persistencia del estado sincronizado de `name`, ligada a la clave local `localKey`. */
export function registerCollectionPersistence(name: string, localKey: string): void {
  getTracker(name).persistKey = localKey;
}

function persistKnown(tracker: CollectionTracker): void {
  if (!tracker.persistKey || typeof window === 'undefined') return;
  try {
    localStorage.setItem(KNOWN_STORAGE_PREFIX + tracker.persistKey, JSON.stringify(Object.fromEntries(tracker.known)));
  } catch {
    // Sin espacio: el próximo snapshot trata la colección como primera sincronización (comportamiento histórico).
  }
}

/** Estado sincronizado guardado en una sesión anterior; null si no existe o si la copia local ya no existe. */
function loadPersistedKnown(tracker: CollectionTracker): Map<string, string> | null {
  if (!tracker.persistKey || typeof window === 'undefined') return null;
  try {
    // Sin copia local no hay nada que comparar: nunca se deduce un borrado de una copia ausente.
    if (localStorage.getItem(tracker.persistKey) === null) return null;
    const raw = localStorage.getItem(KNOWN_STORAGE_PREFIX + tracker.persistKey);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const known = new Map<string, string>();
    for (const [id, hash] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof hash !== 'string') return null;
      known.set(id, hash);
    }
    return known;
  } catch {
    return null;
  }
}

function docBytes(id: string, data: Record<string, unknown>): number {
  return (id.length + JSON.stringify(data).length) * 2; // UTF-16
}

/**
 * Sanitiza un objeto antes de enviarlo a Firestore:
 * 1. Remueve campos con valor `undefined` (Firestore rechaza con "Unsupported field value: undefined").
 * 2. Elimina la propiedad interna `__id` para que no contamine los documentos remotos.
 */
export function sanitizeForFirestore<T>(data: T): Record<string, unknown> {
  if (data === null || data === undefined) return {};
  try {
    const jsonStr = JSON.stringify(data, (key, value) => {
      if (key === '__id') return undefined;
      if (value === undefined) return undefined;
      return value;
    });
    return JSON.parse(jsonStr) as Record<string, unknown>;
  } catch (err) {
    console.error('Error sanitizing data for Firestore:', err);
    return (data as unknown as Record<string, unknown>) || {};
  }
}

/**
 * Calcula el diff `items` y lo conocido en `tracker`, y lo aplica a Firestore:
 * crea/actualiza los cambiados y borra los que desaparecieron de la lista.
 * Devuelve true si todo pudo sincronizarse.
 */
export async function pushCollectionDiff(
  name: string,
  items: Record<string, unknown>[],
  idOf: (item: Record<string, unknown>) => string
): Promise<boolean> {
  const database = getIntranetDb();
  if (!database) return false;
  const tracker = getTracker(name);

  const serialized = new Map<string, string>();
  const toWrite: { id: string; data: Record<string, unknown> }[] = [];
  for (const item of items) {
    const id = idOf(item);
    if (!id) {
      reportError(`Un registro de "${name}" no tiene identificador y se omitió.`);
      continue;
    }
    if (docBytes(id, item) > MAX_DOC_BYTES) {
      reportError(
        `Un registro de "${name}" supera el límite de 1 MB por documento y se omitió al sincronizar.`
      );
      // Demasiado grande para enviarlo, pero NO está borrado: se conserva su huella conocida para
      // que no se interprete como una baja y se elimine la versión que sí está en Firestore.
      const knownHash = tracker.known.get(id);
      if (knownHash !== undefined) serialized.set(id, knownHash);
      continue;
    }
    // Huella del contenido (no del texto JSON): el orden de las claves o el campo interno
    // `__id` no deben hacer que un documento sin cambios se vuelva a escribir.
    const hash = docHash(item);
    serialized.set(id, hash);
    if (tracker.known.get(id) !== hash) {
      toWrite.push({ id, data: item });
    }
  }
  const toDelete: string[] = [];
  for (const id of tracker.known.keys()) {
    if (!serialized.has(id)) {
      toDelete.push(id);
    }
  }

  if (toWrite.length === 0 && toDelete.length === 0) {
    tracker.known = serialized;
    return true;
  }

  let ok = true;
  try {
    type BatchOp = { type: 'set'; id: string; data: Record<string, unknown> } | { type: 'delete'; id: string };
    const ops: BatchOp[] = [
      ...toWrite.map((w) => ({ type: 'set', id: w.id, data: w.data }) as BatchOp),
      ...toDelete.map((id) => ({ type: 'delete', id }) as BatchOp),
    ];
    for (let i = 0; i < ops.length; i += BATCH_MAX_OPS) {
      const batch = writeBatch(database);
      for (const op of ops.slice(i, i + BATCH_MAX_OPS)) {
        if (op.type === 'set') batch.set(doc(database, name, op.id), sanitizeForFirestore(op.data));
        else batch.delete(doc(database, name, op.id));
      }
      await batch.commit();
    }
  } catch (e) {
    ok = false;
    markPushFailure(name);
    schedulePushRetry(name, () => pushCollectionDiff(name, items, idOf));
    reportSyncError(e, name, 'escritura');
  }

  if (ok) {
    tracker.known = serialized;
    tracker.synced = true;
    persistKnown(tracker);
    clearPushFailure(name);
    cancelPushRetry(name);
    reportReady();
  }
  return ok;
}

/**
 * Reemplaza el contenido completo de una colección (reseteo / importación):
 * borra todo lo remoto y escribe `items`. Los trackers se reinician.
 */
export async function replaceCollection(
  name: string,
  items: Record<string, unknown>[],
  idOf: (item: Record<string, unknown>) => string
): Promise<void> {
  const database = getIntranetDb();
  if (!database) return;
  try {
    const snap = await getDocs(collection(database, name));
    let batch = writeBatch(database);
    let ops = 0;
    const commitIfNeeded = async () => {
      if (ops >= BATCH_MAX_OPS) {
        await batch.commit();
        batch = writeBatch(database);
        ops = 0;
      }
    };
    for (const d of snap.docs) {
      await commitIfNeeded();
      batch.delete(d.ref);
      ops++;
    }
    for (const item of items) {
      const id = idOf(item);
      if (!id || docBytes(id, item) > MAX_DOC_BYTES) continue;
      await commitIfNeeded();
      batch.set(doc(database, name, id), sanitizeForFirestore(item));
      ops++;
    }
    if (ops > 0) await batch.commit();
    // Solo si el reemplazo se confirmó: el estado sincronizado pasa a ser exactamente `items`.
    const tracker = getTracker(name);
    tracker.known = new Map(items.filter((i) => idOf(i)).map((i) => [idOf(i), docHash(i)]));
    tracker.synced = true;
    persistKnown(tracker);
    reportReady();
  } catch (e) {
    markPushFailure(name);
    reportSyncError(e, name, 'escritura');
  }
}

/**
 * Escucha una colección: entrega un array con los datos de la base compartida.
 * Devuelve null si no hay sesión aprobada (gate cerrado): NO crea listeners que
 * morirían con permission-denied antes del login.
 * RESILIENCIA: si el listener muere (p. ej. reglas recién publicadas, corte de red),
 * se re-suscribe SOLO cada 60 s en vez de quedar sordo para siempre.
 */
export interface CollectionSnapshotInfo {
  /** Los datos vienen de la caché local del SDK (sin confirmar con el servidor): no sirven para deducir borrados. */
  fromCache: boolean;
  /** Último estado sincronizado conocido (id → huella) ANTES de este snapshot; null en la primera sincronización. */
  previousKnown: Map<string, string> | null;
}

export function subscribeToCollection(
  name: string,
  onItems: (items: Record<string, unknown>[], info: CollectionSnapshotInfo) => void,
  /** Si se indica, solo se escuchan los documentos cuyo `field` es igual a `value` (lectura restringida por reglas). */
  onlyWhere?: { field: string; value: string }
): Unsubscribe | null {
  if (!isSyncGateOpen()) return null;
  const database = getIntranetDb();
  if (!database) return null;
  const ref = onlyWhere
    ? query(collection(database, name), where(onlyWhere.field, '==', onlyWhere.value))
    : collection(database, name);
  const tracker = getTracker(name);

  let activeUnsub: Unsubscribe | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const attach = (): void => {
    if (closed) return;
    activeUnsub?.();
    activeUnsub = onSnapshot(
      ref,
      (snap) => {
        if (!isSyncGateOpen()) return;
        const fromCache = snap.metadata.fromCache;
        const items = snap.docs.map((d) => ({
          ...(d.data() as Record<string, unknown>),
          __id: d.id,
        }));
        // Un snapshot VACÍO que sale de la caché (ej. arranque sin conexión) no dice nada del servidor:
        // si se tomara como "la colección está vacía" se borrarían datos locales válidos.
        if (fromCache && items.length === 0) return;
        const previousKnown = tracker.synced ? new Map(tracker.known) : loadPersistedKnown(tracker);
        // Un documento con escritura local PENDIENTE (aún sin confirmar por el servidor) aparece en el
        // snapshot con nuestro cambio: no es un estado sincronizado. Si se lo anotara como conocido,
        // tras una recarga se lo tomaría por "ya enviado" y se perdería. Conserva la huella anterior.
        const pendingIds = new Set(snap.docs.filter((d) => d.metadata.hasPendingWrites).map((d) => d.id));
        const nextKnown = new Map<string, string>();
        for (const item of items) {
          const id = item.__id as string;
          if (!pendingIds.has(id)) {
            nextKnown.set(id, docHash(item));
            continue;
          }
          const prior = previousKnown?.get(id);
          if (prior !== undefined) nextKnown.set(id, prior);
        }
        tracker.known = nextKnown;
        tracker.bootstrapped = true;
        if (!fromCache) {
          tracker.synced = true;
          persistKnown(tracker);
        }
        reportReady();
        onItems(items, { fromCache, previousKnown });
      },
      (err) => {
        if (!isSyncGateOpen()) return;
        reportSyncError(err, name, 'lectura');
        // Re-suscripción automática: las reglas pueden haberse publicado DESPUÉS de que
        // este listener murió; sin esto la sesión queda sin sincronización en vivo.
        if (!retryTimer && !closed) {
          retryTimer = setTimeout(() => {
            retryTimer = null;
            attach();
          }, LISTENER_RETRY_MS);
        }
      }
    );
  };
  attach();

  return () => {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    activeUnsub?.();
  };
}

/** Marca una colección ya inicializada (para no volver a hacer el seed bootstrap). */
export function markBootstrapped(name: string): void {
  getTracker(name).bootstrapped = true;
}

export function isBootstrapped(name: string): boolean {
  return getTracker(name).bootstrapped;
}

/* ─────────────────────── Documentos individuales (settings/meta) ─────────────────────── */

/**
 * Publica un objeto en un documento individual (ej. settings/app).
 *  - Por defecto reemplaza el documento completo (comportamiento histórico).
 *  - Con `perField` envía SOLO los campos que cambiaron respecto de lo último sincronizado (y quita los que
 *    se eliminaron), sin tocar los demás: un cambio de otro administrador en otro campo no se pisa.
 *    Si no hay estado sincronizado todavía, envía todos los campos sin borrar los que solo existan en remoto.
 */
export async function pushSingleDoc(
  col: string,
  docId: string,
  value: unknown,
  options?: { quiet?: boolean; perField?: boolean }
): Promise<boolean> {
  const database = getIntranetDb();
  if (!database) return false;
  const key = `${col}/${docId}`;
  latestSingleValue.set(key, value);
  try {
    const data = sanitizeForFirestore(value as Record<string, unknown>);
    if (options?.perField) {
      const current = fieldHashes(data);
      const known = getSingleKnown(key);
      const { changed, removed } = known ? changedFields(current, known) : { changed: Object.keys(current), removed: [] };
      if (changed.length > 0 || removed.length > 0) {
        const payload: Record<string, unknown> = {};
        for (const f of changed) payload[f] = data[f];
        for (const f of removed) payload[f] = deleteField();
        await setDoc(doc(database, col, docId), payload, { merge: true });
      }
      // Solo se da por sincronizado lo que se envió; el resto lo actualiza el próximo snapshot.
      const nextKnown: FieldHashes = { ...(known ?? {}) };
      for (const f of changed) nextKnown[f] = current[f];
      for (const f of removed) delete nextKnown[f];
      setSingleKnown(key, nextKnown);
    } else {
      await setDoc(doc(database, col, docId), data);
      setSingleKnown(key, fieldHashes(data));
    }
    clearPushFailure(key);
    cancelPushRetry(key);
    reportReady();
    return true;
  } catch (e) {
    // Publicación inicial de un documento que todavía no existe: si la cuenta no puede escribir, no es un
    // error ni se reintenta (marcarlo como fallo haría ignorar luego lo que publique un administrador).
    if (options?.quiet) return false;
    markPushFailure(key);
    schedulePushRetry(key, () => pushSingleDoc(col, docId, latestSingleValue.get(key) ?? value, options));
    reportSyncError(e, col, 'escritura');
    return false;
  }
}

/** Elimina un documento individual directamente de Firestore. */
export async function deleteSingleDoc(col: string, docId: string): Promise<void> {
  const database = getIntranetDb();
  if (!database) return;
  const key = `${col}/${docId}`;
  try {
    await deleteDoc(doc(database, col, docId));
    clearPushFailure(key);
    cancelPushRetry(key);
    reportReady();
  } catch (e) {
    reportSyncError(e, col, 'escritura');
  }
}

/** Escucha un documento individual; `exists` permite sembrar si aún no existe.
 *  Misma resiliencia que las colecciones: re-suscripción automática tras cada error. */
export interface SingleDocSnapshotInfo {
  /** Los datos vienen de la caché local del SDK (sin confirmar con el servidor): no sirven para deducir nada. */
  fromCache: boolean;
  /** Huella de cada campo en el último contenido sincronizado; null si es la primera sincronización. */
  knownFields: FieldHashes | null;
  /** Huella del contenido remoto; null si el documento no existe. */
  remoteHash: string | null;
}

export function subscribeToSingleDoc(
  col: string,
  docId: string,
  onValue: (value: unknown, exists: boolean, info: SingleDocSnapshotInfo) => void
): Unsubscribe | null {
  if (!isSyncGateOpen()) return null;
  const database = getIntranetDb();
  if (!database) return null;

  let activeUnsub: Unsubscribe | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const attach = (): void => {
    if (closed) return;
    activeUnsub?.();
    activeUnsub = onSnapshot(
      doc(database, col, docId),
      (snap) => {
        if (!isSyncGateOpen()) return;
        reportReady();
        const exists = snap.exists();
        const data = snap.data();
        const info: SingleDocSnapshotInfo = {
          fromCache: snap.metadata.fromCache,
          knownFields: getSingleKnown(`${col}/${docId}`),
          remoteHash: exists && data ? docHash(data) : null,
        };
        // Con una escritura local pendiente el snapshot trae NUESTRO cambio sin confirmar: no es estado sincronizado.
        // Se registra ANTES de avisar, para que un reenvío por campo (ver pushSingleDoc) compare contra este
        // estado y no vuelva a enviar lo que recién llegó del servidor.
        if (!info.fromCache && !snap.metadata.hasPendingWrites && info.remoteHash !== null) {
          setSingleKnown(`${col}/${docId}`, fieldHashes(data ?? {}));
        }
        onValue(data, exists, info);
      },
      (err) => {
        if (!isSyncGateOpen()) return;
        reportSyncError(err, col, 'lectura');
        if (!retryTimer && !closed) {
          retryTimer = setTimeout(() => {
            retryTimer = null;
            attach();
          }, LISTENER_RETRY_MS);
        }
      }
    );
  };
  attach();

  return () => {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    activeUnsub?.();
  };
}

/** Mensaje útil según el código de error y operación (lectura/escritura). */
function reportSyncError(e: unknown, context: string, operation: 'lectura' | 'escritura'): void {
  const code = (e as { code?: string })?.code ?? '';
  if (code === 'failed-precondition' || code === 'not-found') {
    reportError(
      'La base de datos compartida (Firestore) no está creada o no está habilitada. Los cambios se guardan solo en este navegador.'
    );
  } else if (code === 'permission-denied') {
    const hint =
      operation === 'lectura'
        ? 'Firebase bloqueó la LECTURA (Security Rules). Causas probables: (1) las reglas de firestore.rules no están publicadas aún, o (2) tu cuenta de Google no figura como aprobada en authorized_users.'
        : 'Firebase bloqueó la ESCRITURA (Security Rules). Causas probables: (1) las reglas de firestore.rules no están publicadas aún, o (2) tu cuenta no es administrador aprobado.';
    reportError(hint);
  } else {
    console.error(`No se pudo sincronizar "${context}" con Firestore:`, e);
    reportError('No se pudo sincronizar con la base de datos compartida. Se reintenta con cada cambio.');
  }
}


/* ────────────── Auto-diagnóstico de acceso (corre 1 vez/sesión, al loguear admin) ────────── */

/**
 * Comprueba TODA la cadena de una vez y entrega UNA conclusión puntual:
 *   app → proyecto correcto → reglas publicadas → identidad admin reconocida.
 * Distincción clave: si la lectura de authorized_users falla, el problema NO es la
 * cuenta (cualquier sesión puede leer esa colección): es reglas/otra base/otro proyecto.
 */
export async function runAccessDiagnostics(email: string): Promise<void> {
  const database = await ensureFirestoreReady();
  if (!database || typeof window === 'undefined') return;
  const cleanEmail = (email || '').toLowerCase().trim();
  const lines: string[] = [];
  const { getEffectiveFirebaseConfig, getFirebaseIdToken, getFirebaseAuthEmail } = await import('./auth');
  const googleEmail = (getFirebaseAuthEmail() || '').toLowerCase().trim();
  // Contexto completo: identidad de la UI vs identidad REAL de Google en Firebase.
  lines.push(
    `Perfil en la interfaz: ${cleanEmail || 'sin email'} · Sesión de Google real: ${
      googleEmail || 'NINGUNA (no hay login de Google activo)'
    } · Proyecto de la app: ${getEffectiveFirebaseConfig().config.projectId} · base: (predeterminada)`
  );

  // Tipo de sesión: Firestore exige request.auth de Google; el ingreso institucional
  // (solo email) no genera ID token y SIEMPRE quedará bloqueado por reglas.
  const idToken = await getFirebaseIdToken();
  if (!idToken) {
    lines.push(
      '→ La sesión de Google real está VACÍA: ingresaste escribiendo el email (institucional) y Firestore bloquea SIEMPRE esas sesiones. Usá "Continuar con Google".'
    );
  } else if (googleEmail && cleanEmail && googleEmail !== cleanEmail) {
    lines.push(
      `→ ATENCIÓN: la sesión de Google (${googleEmail}) es OTRA cuenta distinta a la mostrada en la interfaz (${cleanEmail}).`
    );
  }
  try {
    await getDoc(doc(database, 'authorized_users', cleanEmail || '__x__'));
    lines.push('→ Lectura de authorized_users OK: las reglas SI son visibles desde esta app/base.');
    try {
      await setDoc(doc(database, 'meta', 'health_check'), {
        at: new Date().toISOString(),
        by: cleanEmail,
      });
      lines.push('→ Escritura OK: tu cuenta está reconocida como admin. Todo el sistema sincroniza bien.');
    } catch (writeErr) {
      const code = (writeErr as { code?: string })?.code ?? '';
      if (code === 'permission-denied') {
        lines.push('→ Escritura DENEGADA pero lectura OK: las reglas confirman que tu email NO es admin maestro.');
        lines.push('   → Verificá con qué Gmail entraste (o pedí la aprobación/rol). Email del token: ' + cleanEmail);
      } else {
        lines.push(`→ Escritura falló (${code}).`);
      }
    }
  } catch (readErr) {
    const code = (readErr as { code?: string })?.code ?? '';
    if (code === 'permission-denied') {
      lines.push(
        '→ La app NO puede leer authorized_users: para ESTA app las reglas siguen en bloqueo total. Causas: (a) pegaste las reglas en otra BASE del selector (usá la "(predeterminada)"), (b) pegaste en otro PROYECTO (la app usa: ' +
          getEffectiveFirebaseConfig().config.projectId +
          '), o (c) el botón Publicar no se concretó.'
      );
    } else {
      lines.push(`→ Lectura falló (${code}).`);
    }
  }
  lastReportedError = '';
  try {
    window.dispatchEvent(new CustomEvent(FIRESTORE_DIAGNOSIS_EVENT, { detail: { lines } }));
  } catch {
    // Ignore
  }
  console.info('[Firebase · diagnóstico]', lines.join(' | '));
}
