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
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  setDoc,
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
 * Por colección: último contenido conocido (local + snapshot remoto) serializado por ID,
 * para calcular qué documentos cambió al leer una lista nueva y no reescribir todo a Firestore.
 */
interface CollectionTracker {
  known: Map<string, string>;
  bootstrapped: boolean;
}

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

function markPushFailure(key: string): void {
  failedPushes.set(key, Date.now());
}

function clearPushFailure(key: string): void {
  failedPushes.delete(key);
}

const trackers = new Map<string, CollectionTracker>();

function getTracker(name: string): CollectionTracker {
  let t = trackers.get(name);
  if (!t) {
    t = { known: new Map(), bootstrapped: false };
    trackers.set(name, t);
  }
  return t;
}

function docBytes(id: string, data: Record<string, unknown>): number {
  return (id.length + JSON.stringify(data).length) * 2; // UTF-16
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
      continue;
    }
    serialized.set(id, JSON.stringify(item));
    if (tracker.known.get(id) !== JSON.stringify(item)) {
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
        if (op.type === 'set') batch.set(doc(database, name, op.id), op.data);
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
      batch.set(doc(database, name, id), item);
      ops++;
    }
    if (ops > 0) await batch.commit();
    reportReady();
  } catch (e) {
    markPushFailure(name);
    reportSyncError(e, name, 'escritura');
  }
  getTracker(name).known = new Map(items.map((i) => [idOf(i), JSON.stringify(i)]));
}

/**
 * Escucha una colección: entrega un array con los datos de la base compartida.
 * Devuelve null si no hay sesión aprobada (gate cerrado): NO crea listeners que
 * morirían con permission-denied antes del login.
 * RESILIENCIA: si el listener muere (p. ej. reglas recién publicadas, corte de red),
 * se re-suscribe SOLO cada 60 s en vez de quedar sordo para siempre.
 */
export function subscribeToCollection(
  name: string,
  onItems: (items: Record<string, unknown>[]) => void
): Unsubscribe | null {
  if (!isSyncGateOpen()) return null;
  const database = getIntranetDb();
  if (!database) return null;
  const ref = collection(database, name);
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
        const items = snap.docs.map((d) => ({
          ...(d.data() as Record<string, unknown>),
          __id: d.id,
        }));
        tracker.known = new Map(items.map((i) => [i.__id as string, JSON.stringify({ ...i, __id: undefined })]));
        tracker.bootstrapped = true;
        reportReady();
        onItems(items);
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

/** Publica un objeto en un documento individual (ej. settings/app). */
export async function pushSingleDoc(col: string, docId: string, value: unknown): Promise<void> {
  const database = getIntranetDb();
  if (!database) return;
  const key = `${col}/${docId}`;
  try {
    await setDoc(doc(database, col, docId), value as Record<string, unknown>);
    clearPushFailure(key);
    cancelPushRetry(key);
    reportReady();
  } catch (e) {
    markPushFailure(key);
    schedulePushRetry(key, () => pushSingleDoc(col, docId, value));
    reportSyncError(e, col, 'escritura');
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
export function subscribeToSingleDoc(
  col: string,
  docId: string,
  onValue: (value: unknown, exists: boolean) => void
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
        onValue(snap.data(), snap.exists());
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
