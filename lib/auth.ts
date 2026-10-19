import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithCredential,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  type Auth,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import defaultFirebaseConfig from '../firebase-applet-config.json';
import {
  MASTER_ADMIN_EMAIL,
  MASTER_ADMIN_EMAILS,
  DEFAULT_VISITOR_EMAILS,
  ALLOWED_VISITOR_EMAILS,
  VISITOR_TEST_EMAIL,
  isMasterAdminEmail,
  isAllowedVisitorEmail,
} from './access-config';
import { generateId } from './utils';
import {
  deleteSingleDoc,
  ensureFirestoreReady,
  getIntranetDb,
  hasActivePushFailure,
  isSyncGateOpen,
  pushCollectionDiff,
  pushSingleDoc,
  registerGateOpenHandler,
  runAccessDiagnostics,
  setFirestoreSyncGate,
  subscribeToCollection,
  subscribeToSingleDoc,
} from './firestore';

export interface CustomFirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
  measurementId?: string;
  oAuthClientId?: string;
}

export interface ActiveFirebaseConfigInfo {
  config: CustomFirebaseConfig;
  source: 'custom_ui' | 'env_vars' | 'default_file';
  hostname: string;
  origin: string;
  isEmbeddedIframe: boolean;
}

const CUSTOM_FIREBASE_CONFIG_KEY = 'icl_intranet_custom_firebase_config_v1';

/**
 * Reads custom Firebase config saved via the UI (if any)
 */
export function getCustomFirebaseConfig(): CustomFirebaseConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CUSTOM_FIREBASE_CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.apiKey && parsed.authDomain && parsed.projectId) {
      return parsed as CustomFirebaseConfig;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolves the effective Firebase & Google OAuth configuration across environments:
 * 1. Custom UI configuration saved in localStorage (highest priority for instant testing/switching)
 * 2. Environment variables (NEXT_PUBLIC_FIREBASE_*) for Vercel, Shopify, Render, Docker, etc.
 * 3. Default firebase-applet-config.json (AI Studio & default fallback)
 */
export function getEffectiveFirebaseConfig(): ActiveFirebaseConfigInfo {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  let isEmbeddedIframe = false;
  if (typeof window !== 'undefined') {
    try {
      isEmbeddedIframe = window.self !== window.top;
    } catch {
      isEmbeddedIframe = true;
    }
  }

  const customConfig = getCustomFirebaseConfig();
  if (customConfig) {
    return {
      config: {
        apiKey: customConfig.apiKey.trim(),
        authDomain: customConfig.authDomain.trim(),
        projectId: customConfig.projectId.trim(),
        storageBucket: customConfig.storageBucket?.trim() || `${customConfig.projectId.trim()}.firebasestorage.app`,
        messagingSenderId: customConfig.messagingSenderId?.trim() || '',
        appId: customConfig.appId?.trim() || '',
        measurementId: customConfig.measurementId?.trim() || '',
        oAuthClientId: customConfig.oAuthClientId?.trim() || defaultFirebaseConfig.oAuthClientId || '',
      },
      source: 'custom_ui',
      hostname,
      origin,
      isEmbeddedIframe,
    };
  }

  const isValidEnvValue = (val?: string, placeholderPrefix?: string) => {
    if (!val) return false;
    const t = val.trim();
    if (!t || t === '""' || t === "''") return false;
    if (
      t === 'AIzaSy...' ||
      t.startsWith('tu-proyecto') ||
      t.startsWith('TU_') ||
      t.startsWith('MY_') ||
      t.includes('123456789012')
    ) {
      return false;
    }
    if (placeholderPrefix && t.startsWith(placeholderPrefix)) return false;
    return true;
  };

  const envApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
  const envAuthDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim();
  const envProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();

  if (
    isValidEnvValue(envApiKey) &&
    isValidEnvValue(envAuthDomain) &&
    isValidEnvValue(envProjectId)
  ) {
    const customOAuthId = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID?.trim();
    return {
      config: {
        apiKey: envApiKey!,
        authDomain: envAuthDomain!,
        projectId: envProjectId!,
        storageBucket:
          isValidEnvValue(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET)
            ? process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!.trim()
            : `${envProjectId}.firebasestorage.app`,
        messagingSenderId:
          isValidEnvValue(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID)
            ? process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!.trim()
            : '',
        appId:
          isValidEnvValue(process.env.NEXT_PUBLIC_FIREBASE_APP_ID)
            ? process.env.NEXT_PUBLIC_FIREBASE_APP_ID!.trim()
            : defaultFirebaseConfig.appId,
        measurementId:
          isValidEnvValue(process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID)
            ? process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID!.trim()
            : '',
        oAuthClientId:
          isValidEnvValue(customOAuthId)
            ? customOAuthId!
            : defaultFirebaseConfig.oAuthClientId || '',
      },
      source: 'env_vars',
      hostname,
      origin,
      isEmbeddedIframe,
    };
  }

  const fallbackOAuthId = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID?.trim();

  return {
    config: {
      apiKey: defaultFirebaseConfig.apiKey,
      authDomain: defaultFirebaseConfig.authDomain,
      projectId: defaultFirebaseConfig.projectId,
      storageBucket: defaultFirebaseConfig.storageBucket,
      messagingSenderId: defaultFirebaseConfig.messagingSenderId,
      appId: defaultFirebaseConfig.appId,
      measurementId: defaultFirebaseConfig.measurementId || '',
      oAuthClientId:
        isValidEnvValue(fallbackOAuthId)
          ? fallbackOAuthId!
          : defaultFirebaseConfig.oAuthClientId || '',
    },
    source: 'default_file',
    hostname,
    origin,
    isEmbeddedIframe,
  };
}

/**
 * Parses a pasted Firebase snippet (either valid JSON or a JS object snippet from Firebase Console)
 */
export function parseFirebaseConfigSnippet(input: string): CustomFirebaseConfig | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed.apiKey && parsed.authDomain && parsed.projectId) {
      return {
        apiKey: String(parsed.apiKey).trim(),
        authDomain: String(parsed.authDomain).trim(),
        projectId: String(parsed.projectId).trim(),
        storageBucket: parsed.storageBucket ? String(parsed.storageBucket).trim() : '',
        messagingSenderId: parsed.messagingSenderId ? String(parsed.messagingSenderId).trim() : '',
        appId: parsed.appId ? String(parsed.appId).trim() : '',
        measurementId: parsed.measurementId ? String(parsed.measurementId).trim() : '',
        oAuthClientId: parsed.oAuthClientId ? String(parsed.oAuthClientId).trim() : '',
      };
    }
  } catch {
    // Fallback regex extraction for JS snippets like `const firebaseConfig = { apiKey: "...", ... };`
  }

  const extractField = (key: string): string => {
    const regex = new RegExp(`["']?${key}["']?\\s*:\\s*["']([^"']+)["']`, 'i');
    const match = trimmed.match(regex);
    return match ? match[1].trim() : '';
  };

  const apiKey = extractField('apiKey');
  const authDomain = extractField('authDomain');
  const projectId = extractField('projectId');

  if (!apiKey || !authDomain || !projectId) {
    return null;
  }

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket: extractField('storageBucket'),
    messagingSenderId: extractField('messagingSenderId'),
    appId: extractField('appId'),
    measurementId: extractField('measurementId'),
    oAuthClientId: extractField('oAuthClientId'),
  };
}

// Initialize default Firebase App safely (singleton)
const initialConfig = getEffectiveFirebaseConfig().config;
const defaultApp: FirebaseApp =
  getApps().length > 0 ? getApp() : initializeApp(initialConfig);
export const auth: Auth = getAuth(defaultApp);

/**
 * Returns the active Firebase Auth instance corresponding to the current effective configuration.
 * If the user customized their Firebase project at runtime, creates/reuses a dedicated named app instance.
 */
export function getActiveAuth(): Auth {
  const { config, source } = getEffectiveFirebaseConfig();
  if (source === 'default_file' || source === 'env_vars') {
    return auth;
  }
  const appName = `custom_${config.projectId}_${config.apiKey.slice(-6)}`;
  const existing = getApps().find((a) => a.name === appName);
  const customApp = existing || initializeApp(config, appName);
  return getAuth(customApp);
}

/**
 * Configures resilient persistence on the Auth instance (handles iframes like Shopify, Safari ITP, etc.)
 */
async function ensureResilientPersistence(targetAuth: Auth): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    await setPersistence(targetAuth, browserLocalPersistence);
  } catch {
    try {
      await setPersistence(targetAuth, browserSessionPersistence);
    } catch {
      try {
        await setPersistence(targetAuth, inMemoryPersistence);
      } catch {
        // Ignore if persistence cannot be mutated
      }
    }
  }
}

export function saveCustomFirebaseConfig(config: CustomFirebaseConfig): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CUSTOM_FIREBASE_CONFIG_KEY, JSON.stringify(config));
}

export function clearCustomFirebaseConfig(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CUSTOM_FIREBASE_CONFIG_KEY);
}

// Administradores y visitantes: fuente única compartida con el servidor (ver lib/access-config.ts).
export {
  MASTER_ADMIN_EMAIL,
  MASTER_ADMIN_EMAILS,
  DEFAULT_VISITOR_EMAILS,
  ALLOWED_VISITOR_EMAILS,
  VISITOR_TEST_EMAIL,
  isMasterAdminEmail,
  isAllowedVisitorEmail,
};

/** Identificador único para registros de usuario (ver `generateId` en utils). */
const newUserId = (): string => generateId('emp');

/** Crea un Error con `code` (y datos extra) para que la UI pueda distinguir el motivo. */
function codedError(message: string, code: string, extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(message), { code, ...extra });
}

export type UserRole = 'administrador' | 'visitante';
export type UserStatus = 'aprobado' | 'pendiente' | 'rechazado';

export interface AuthorizedUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  approvedAt?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string | null;
  role: UserRole;
  status: UserStatus;
  provider: 'google' | 'institucional';
}

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
];

/**
 * Builds a GoogleAuthProvider configured either with standard Google Identity scopes
 * (compatible with ANY Google account, including visitors and unverified apps) or full Workspace scopes.
 */
function createGoogleProvider(includeWorkspaceScopes = false, forceConsent = false): GoogleAuthProvider {
  const googleProvider = new GoogleAuthProvider();
  googleProvider.addScope('email');
  googleProvider.addScope('profile');

  if (includeWorkspaceScopes) {
    WORKSPACE_SCOPES.forEach((scope) => googleProvider.addScope(scope));
  }

  googleProvider.setCustomParameters({
    prompt: forceConsent ? 'consent' : 'select_account',
  });

  return googleProvider;
}

// Storage keys
export const TOKEN_STORAGE_KEY = 'icl_intranet_access_token_v3';
export const TOKEN_EXPIRY_STORAGE_KEY = 'icl_intranet_token_expiry_v3';
export const PROFILE_STORAGE_KEY = 'icl_intranet_user_profile_v3';
export const SESSION_EXPIRY_STORAGE_KEY = 'icl_intranet_session_expiry_v3';
export const SESSION_LAST_ACTIVE_KEY = 'icl_intranet_session_last_active_v3';
export const USERS_STORAGE_KEY = 'icl_intranet_authorized_users_v3';
export const APPROVAL_MODE_KEY = 'icl_intranet_approval_mode_v3';

// Default persistent session window: 30 days of active retention in localStorage
export const DEFAULT_PERSISTENT_SESSION_DAYS = 30;
export const DEFAULT_PERSISTENT_SESSION_MS = DEFAULT_PERSISTENT_SESSION_DAYS * 24 * 60 * 60 * 1000;

// Initial pre-registered users (internal record)
// Un registro por cada administrador configurado (el principal conserva el id histórico 'admin-master').
const INITIAL_AUTHORIZED_USERS: readonly AuthorizedUser[] = MASTER_ADMIN_EMAILS.map((email) => ({
  id: email === MASTER_ADMIN_EMAIL ? 'admin-master' : `admin-${email.replace(/[^a-z0-9]/g, '_')}`,
  email,
  displayName: email === MASTER_ADMIN_EMAIL ? 'Administrador General' : 'Administrador del Instituto',
  role: 'administrador' as const,
  status: 'aprobado' as const,
  createdAt: '2026-01-01',
  approvedAt: '2026-01-01',
}));

const initialUsers = (): AuthorizedUser[] => INITIAL_AUTHORIZED_USERS.map((u) => ({ ...u }));

/* ─────────────────────── USUARIOS AUTORIZADOS: BACKEND COMPARTIDO ───────────────────────
 * La lista autorizada vive en la colección Firestore `authorized_users` (un doc por EMAIL,
 * que es el identificador estable entre dispositivos). localStorage queda como caché local
 * y arranca offline. Al llegar un snapshot remoto, él manda para cada email presente
 * (Firestore es la fuente de verdad); los registros solo locales (aún sin publicar, ej.
 * sin conexión) se mantienen hasta que el push lo termine.
 */

const AUTHORIZED_USERS_COLLECTION = 'authorized_users';

let usersSyncStarted = false;

/** Sincroniza la lista autorizada con el backend compartido (idempotente). */
function ensureUsersSync(): void {
  if (usersSyncStarted || typeof window === 'undefined' || !isSyncGateOpen()) return;
  const subscription = subscribeToCollection(AUTHORIZED_USERS_COLLECTION, (remoteDocs) => {
    // Si el último push falló, no aplicar un snapshot que revierta los locales más nuevos.
    if (hasActivePushFailure(AUTHORIZED_USERS_COLLECTION)) return;
    if (remoteDocs.length === 0) {
      // Sin base aún: se siembran los administradores del entorno (master pueden crear por reglas).
      void pushCollectionDiff(
        AUTHORIZED_USERS_COLLECTION,
        initialUsers() as unknown as Record<string, unknown>[],
        (u) => (typeof u.email === 'string' ? u.email.toLowerCase().trim() : '')
      );
      return;
    }
    applyRemoteUsers(remoteDocs);
  });
  if (subscription) usersSyncStarted = true;
}

/** Id de doc para el backend: el EMAIL (identificador estable entre dispositivos). */
function userDocId(u: Record<string, unknown>): string {
  return typeof u.email === 'string' ? u.email.toLowerCase().trim() : '';
}

// Sin sesión aprobada los listeners se quedan cerrados; al loguear, el gate los re-abre.
if (typeof window !== 'undefined') {
  registerGateOpenHandler(() => {
    ensureUsersSync();
    ensureApprovalModeSync();
  });
}

/** Gate de sincronización según la sesión real de Firebase (aprobado ↔ cerrado). */
let diagnosticsRan = false;

function applySyncGate(authorized: boolean): void {
  setFirestoreSyncGate(authorized);
  // Un solo diagnóstico de acceso por sesión, con la sesión ADMIN:
  // distingue "reglas no visibles para esta app/base" de "cuenta no admin".
  if (authorized && !diagnosticsRan) {
    diagnosticsRan = true;
    void runAccessDiagnostics(cachedUserProfile?.email ?? '');
  }
}

/** Convierte un doc remoto en un registro válido de usuario (o null si está corrupto). */
function materializeRemoteUser(doc: Record<string, unknown>): AuthorizedUser | null {
  const email = typeof doc.email === 'string' ? doc.email.toLowerCase().trim() : '';
  const role = doc.role === 'administrador' ? 'administrador' : 'visitante';
  const status =
    doc.status === 'aprobado' || doc.status === 'rechazado' || doc.status === 'pendiente'
      ? (doc.status as UserStatus)
      : null;
  if (!email || !status) return null;
  return {
    id: typeof doc.id === 'string' && doc.id ? doc.id : `user-${email.replace(/[^a-z0-9]/g, '_')}`,
    email,
    displayName: typeof doc.displayName === 'string' && doc.displayName ? doc.displayName : email,
    role: isMasterAdminEmail(email) ? 'administrador' : role,
    status: isMasterAdminEmail(email) ? 'aprobado' : status,
    createdAt: typeof doc.createdAt === 'string' ? doc.createdAt : '2026-01-01',
    ...(typeof doc.approvedAt === 'string' ? { approvedAt: doc.approvedAt } : {}),
  };
}

/**
 * Aplica el snapshot remoto: Firestore es la fuente de verdad.
 * Los usuarios eliminados en Firestore NO se conservan localmente ni se vuelven a subir.
 */
function applyRemoteUsers(remoteDocs: Record<string, unknown>[]): void {
  const remoteUsers = remoteDocs
    .map(materializeRemoteUser)
    .filter((u): u is AuthorizedUser => u !== null);
  const remoteByEmail = new Map(remoteUsers.map((u) => [u.email.toLowerCase(), u]));

  const merged: AuthorizedUser[] = [];
  const seen = new Set<string>();

  // 1) Administradores maestros obligatorios del entorno (siempre deben existir)
  for (const admin of initialUsers()) {
    const email = admin.email.toLowerCase();
    seen.add(email);
    const remote = remoteByEmail.get(email);
    merged.push(remote ? { ...admin, ...remote, role: 'administrador', status: 'aprobado' } : admin);
  }

  // 2) Documentos remotos de Firestore (usuarios autorizados, pendientes o rechazados)
  for (const [email, remote] of remoteByEmail) {
    if (!seen.has(email)) {
      merged.push(remote);
      seen.add(email);
    }
  }

  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(merged));
    notifyAuthorizedUsersChanged();
  } catch {
    // Ignore (cache local sin espacio: la fuente sigue siendo Firestore)
  }
}

/** Notifica a la UI (evento storage) que la lista autorizada cambió desde el backend. */
function notifyAuthorizedUsersChanged(): void {
  try {
    window.dispatchEvent(new StorageEvent('storage', { key: USERS_STORAGE_KEY }));
  } catch {
    window.dispatchEvent(new Event('storage'));
  }
}

/** Lee la lista cruda de localStorage sin escribir nada. */
function readAuthorizedUsersRaw(allowSeedFeed: boolean): AuthorizedUser[] {
  const raw = getAuthorizedUsers(); // normalize + seed (idempotent)
  void allowSeedFeed;
  return raw;
}

export function getAuthorizedUsers(): AuthorizedUser[] {
  ensureUsersSync();
  if (typeof window === 'undefined') return initialUsers();
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (!raw) {
      const seed = initialUsers();
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return initialUsers();

    // Filter out obsolete legacy visitor demo accounts
    let sanitized = parsed.filter((u) => u.id !== 'visitor-alexis');

    // Ensure every configured administrator is registered, approved and with role 'administrador'
    initialUsers().forEach((admin) => {
      const found = sanitized.find((u) => u.email?.toLowerCase() === admin.email);
      if (!found) {
        sanitized.push(admin);
      } else if (found.role !== 'administrador' || found.status !== 'aprobado') {
        found.role = 'administrador';
        found.status = 'aprobado';
      }
    });

    // Ensure all configured visitor accounts are registered and approved with role 'visitante'
    ALLOWED_VISITOR_EMAILS.forEach((vEmail) => {
      const lower = vEmail.toLowerCase();
      const foundVisitor = sanitized.find((u) => u.email?.toLowerCase() === lower);
      if (!foundVisitor) {
        sanitized.push({
          id: `visitor-${lower.replace(/[^a-z0-9]/g, '_')}`,
          email: lower,
          displayName: `Visitante (${lower})`,
          role: 'visitante',
          status: 'aprobado',
          createdAt: '2026-01-01',
          approvedAt: '2026-01-01',
        });
      } else if (foundVisitor.role !== 'visitante' || foundVisitor.status !== 'aprobado') {
        foundVisitor.role = 'visitante';
        foundVisitor.status = 'aprobado';
      }
    });
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(sanitized));

    return sanitized;
  } catch {
    return initialUsers();
  }
}

export function saveAuthorizedUsers(users: AuthorizedUser[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
    // Notifica a la MISMA pestaña: los eventos 'storage' nativos solo cruzan entre
    // pestañas, así que sin esto el panel admin (y otros lectores) quedaban con la
    // lista vieja hasta recargar tras aprobar/rechazar/eliminar desde el modal.
    notifyAuthorizedUsersChanged();
    ensureUsersSync();
    // Publicar en el backend compartido: un doc por EMAIL (identificador estable).
    void pushCollectionDiff(
      AUTHORIZED_USERS_COLLECTION,
      users as unknown as Record<string, unknown>[],
      userDocId
    );
  } catch (e) {
    console.error('Error saving authorized users:', e);
  }
}

/* Modo de aprobación: configuración compartida (doc meta/approval_mode) con caché local. */
export function getApprovalMode(): 'manual' | 'auto_visitor' {
  if (typeof window === 'undefined') return 'manual';
  ensureApprovalModeSync();
  try {
    const mode = localStorage.getItem(APPROVAL_MODE_KEY);
    return mode === 'auto_visitor' ? 'auto_visitor' : 'manual';
  } catch {
    return 'manual';
  }
}

let approvalModeSyncStarted = false;

/** Sincroniza el modo de aprobación con el doc compartido (idempotente). */
function ensureApprovalModeSync(): void {
  if (approvalModeSyncStarted || typeof window === 'undefined' || !isSyncGateOpen()) return;
  const sub = subscribeToSingleDoc('meta', 'approval_mode', (remote, exists) => {
    const mode = exists && (remote as { mode?: unknown } | null)?.mode === 'auto_visitor'
      ? 'auto_visitor'
      : 'manual';
    try {
      if ((localStorage.getItem(APPROVAL_MODE_KEY) ?? 'manual') !== mode) {
        localStorage.setItem(APPROVAL_MODE_KEY, mode);
        notifyAuthorizedUsersChanged();
      }
    } catch {
      // Ignore
    }
  });
  if (sub) approvalModeSyncStarted = true;
}

export function setApprovalMode(mode: 'manual' | 'auto_visitor'): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(APPROVAL_MODE_KEY, mode);
  } catch (e) {
    console.error('Error saving approval mode:', e);
  }
  ensureApprovalModeSync();
  void pushSingleDoc('meta', 'approval_mode', { mode });
}

export function updateLocalUserRecord(record: AuthorizedUser): void {
  if (typeof window === 'undefined') return;
  try {
    const users = getAuthorizedUsers();
    const cleanEmail = record.email.toLowerCase().trim();
    const idx = users.findIndex((u) => u.email.toLowerCase().trim() === cleanEmail);
    if (idx >= 0) {
      users[idx] = { ...users[idx], ...record };
    } else {
      users.push(record);
    }
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
    notifyAuthorizedUsersChanged();
  } catch {
    // Ignore
  }
}

export function approveUser(userId: string): AuthorizedUser[] {
  const users = getAuthorizedUsers();
  let targetEmail = '';
  let updatedRecord: AuthorizedUser | null = null;
  const updated = users.map((u) => {
    if (u.id === userId || u.email.toLowerCase() === userId.toLowerCase()) {
      targetEmail = u.email.toLowerCase().trim();
      updatedRecord = {
        ...u,
        status: 'aprobado' as UserStatus,
        approvedAt: new Date().toISOString().split('T')[0],
      };
      return updatedRecord;
    }
    return u;
  });
  saveAuthorizedUsers(updated);

  if (targetEmail && updatedRecord) {
    const database = getIntranetDb();
    if (database) {
      void setDoc(
        doc(database, AUTHORIZED_USERS_COLLECTION, targetEmail),
        updatedRecord as unknown as Record<string, unknown>,
        { merge: true }
      ).catch((err) => console.error('Error aprobando en Firestore:', err));
    }
  }
  return updated;
}

export function rejectUser(userId: string): AuthorizedUser[] {
  const users = getAuthorizedUsers();
  let targetEmail = '';
  const updated = users.map((u) => {
    if ((u.id === userId || u.email.toLowerCase() === userId.toLowerCase()) && !isMasterAdminEmail(u.email)) {
      targetEmail = u.email.toLowerCase().trim();
      return {
        ...u,
        status: 'rechazado' as UserStatus,
      };
    }
    return u;
  });
  saveAuthorizedUsers(updated);

  if (targetEmail) {
    const database = getIntranetDb();
    if (database) {
      void setDoc(
        doc(database, AUTHORIZED_USERS_COLLECTION, targetEmail),
        { status: 'rechazado' },
        { merge: true }
      ).catch((err) => console.error('Error rechazando en Firestore:', err));
    }
  }
  return updated;
}

export function deleteAuthorizedUser(userId: string): AuthorizedUser[] {
  const users = getAuthorizedUsers();
  const toDelete = users.find(
    (u) => (u.id === userId || u.email.toLowerCase() === userId.toLowerCase()) && !isMasterAdminEmail(u.email)
  );
  const updated = users.filter(
    (u) => (u.id !== userId && u.email.toLowerCase() !== userId.toLowerCase()) || isMasterAdminEmail(u.email)
  );
  
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updated));
    notifyAuthorizedUsersChanged();
  } catch (e) {
    console.error('Error actualizando storage tras borrar usuario:', e);
  }

  if (toDelete) {
    const targetEmail = toDelete.email.toLowerCase().trim();
    void deleteSingleDoc(AUTHORIZED_USERS_COLLECTION, targetEmail).catch((err) => {
      console.error('Error eliminando de Firestore:', err);
    });
  }
  return updated;
}

const BASIC_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function addAuthorizedEmployee(email: string, displayName: string): AuthorizedUser {
  const users = getAuthorizedUsers();
  const cleanEmail = email.trim().toLowerCase();
  if (!BASIC_EMAIL_RE.test(cleanEmail)) {
    throw new Error('El correo electrónico no es válido.');
  }
  // Un administrador ya tiene acceso total: nunca se lo vuelve a registrar como integrante.
  const existingAdmin = users.find((u) => u.email.toLowerCase() === cleanEmail && isMasterAdminEmail(cleanEmail));
  if (existingAdmin) return existingAdmin;
  const cleanName = displayName.trim() || cleanEmail.split('@')[0];

  const existingIndex = users.findIndex((u) => u.email.toLowerCase() === cleanEmail);
  const now = new Date().toISOString().split('T')[0];

  let savedRecord: AuthorizedUser;
  if (existingIndex >= 0) {
    const updated = [...users];
    updated[existingIndex] = {
      ...updated[existingIndex],
      displayName: cleanName,
      status: 'aprobado',
      approvedAt: now,
    };
    savedRecord = updated[existingIndex];
    saveAuthorizedUsers(updated);
  } else {
    const newUser: AuthorizedUser = {
      id: newUserId(),
      email: cleanEmail,
      displayName: cleanName,
      role: 'visitante', // Employees are strictly visitors
      status: 'aprobado',
      createdAt: now,
      approvedAt: now,
    };
    savedRecord = newUser;
    users.push(newUser);
    saveAuthorizedUsers(users);
  }

  const database = getIntranetDb();
  if (database) {
    void setDoc(
      doc(database, AUTHORIZED_USERS_COLLECTION, cleanEmail),
      savedRecord as unknown as Record<string, unknown>,
      { merge: true }
    ).catch((err) => console.error('Error guardando integrante en Firestore:', err));
  }

  return savedRecord;
}

export interface AuthCheckResult {
  authorized: boolean;
  role: UserRole;
  status: UserStatus;
  message?: string;
}

/**
 * Checks authorization rules:
 * 1. Master admin email is strictly Administrador and always approved.
 * 2. All other users are strictly Visitante (read-only).
 * 3. Non-admins require approval unless auto_visitor mode is enabled.
 */
export function checkUserAuthorization(email: string, displayName: string): AuthCheckResult {
  const cleanEmail = email.trim().toLowerCase();

  // Una cuenta sin email (ej. proveedor que no lo expone) no puede identificarse: se rechaza
  // en lugar de registrar un usuario "pendiente" con email vacío.
  if (!cleanEmail) {
    return {
      authorized: false,
      role: 'visitante',
      status: 'rechazado',
      message: 'Tu cuenta de Google no informó un correo electrónico, por lo que no puede ser verificada.',
    };
  }

  // Strict enforcement for environment configured visitor accounts
  if (isAllowedVisitorEmail(cleanEmail)) {
    return {
      authorized: true,
      role: 'visitante',
      status: 'aprobado',
    };
  }

  // Master Administrator Check
  if (isMasterAdminEmail(cleanEmail)) {
    return {
      authorized: true,
      role: 'administrador',
      status: 'aprobado',
    };
  }

  const users = getAuthorizedUsers();
  const found = users.find((u) => u.email.toLowerCase() === cleanEmail);
  const now = new Date().toISOString().split('T')[0];

  if (found) {
    if (found.status === 'aprobado') {
      return {
        authorized: true,
        role: 'visitante', // Strictly visitor
        status: 'aprobado',
      };
    }
    if (found.status === 'rechazado') {
      return {
        authorized: false,
        role: 'visitante',
        status: 'rechazado',
        message: 'El acceso para este correo ha sido revocado por el Administrador del Sistema.',
      };
    }
    return {
      authorized: false,
      role: 'visitante',
      status: 'pendiente',
      message: 'Tu solicitud de acceso está registrada y pendiente de aprobación por el Administrador del Sistema.',
    };
  }

  // User not yet registered
  const mode = getApprovalMode();
  if (mode === 'auto_visitor') {
    const autoUser: AuthorizedUser = {
      id: newUserId(),
      email: cleanEmail,
      displayName: displayName.trim() || cleanEmail.split('@')[0],
      role: 'visitante',
      status: 'aprobado',
      createdAt: now,
      approvedAt: now,
    };
    users.push(autoUser);
    saveAuthorizedUsers(users);
    return {
      authorized: true,
      role: 'visitante',
      status: 'aprobado',
    };
  }

  // Register as pending request
  const pendingUser: AuthorizedUser = {
    id: newUserId(),
    email: cleanEmail,
    displayName: displayName.trim() || cleanEmail.split('@')[0],
    role: 'visitante',
    status: 'pendiente',
    createdAt: now,
  };
  users.push(pendingUser);
  saveAuthorizedUsers(users);

  return {
    authorized: false,
    role: 'visitante',
    status: 'pendiente',
    message: 'Tu registro ha sido enviado al Administrador del Sistema. Podrás ingresar como Visitante (consulta) una vez que sea autorizado.',
  };
}

/**
 * Verifica y sincroniza el estado de autorización del usuario directamente con Firestore
 * mientras la sesión de Google sigue autenticada en Firebase (request.auth != null).
 * Si es un usuario nuevo, crea su ficha en authorized_users/{email} en tiempo real.
 */
export async function syncAndCheckUserInFirestore(
  firebaseUser: User,
  fallbackDisplayName?: string
): Promise<AuthCheckResult> {
  const cleanEmail = (firebaseUser.email || '').trim().toLowerCase();
  if (!cleanEmail) {
    return {
      authorized: false,
      role: 'visitante',
      status: 'rechazado',
      message: 'Tu cuenta de Google no informó un correo electrónico, por lo que no puede ser verificada.',
    };
  }

  // Master admin check: siempre autorizado
  if (isMasterAdminEmail(cleanEmail)) {
    return {
      authorized: true,
      role: 'administrador',
      status: 'aprobado',
    };
  }

  // Pre-configured allowed visitors: siempre autorizados
  if (isAllowedVisitorEmail(cleanEmail)) {
    return {
      authorized: true,
      role: 'visitante',
      status: 'aprobado',
    };
  }

  const displayName = fallbackDisplayName?.trim() || firebaseUser.displayName?.trim() || cleanEmail.split('@')[0];
  const now = new Date().toISOString().split('T')[0];

  try {
    const database = await ensureFirestoreReady();
    if (database) {
      const userDocRef = doc(database, AUTHORIZED_USERS_COLLECTION, cleanEmail);
      const snap = await getDoc(userDocRef);

      if (snap.exists()) {
        const data = snap.data();
        const role: UserRole = data.role === 'administrador' ? 'administrador' : 'visitante';
        const status: UserStatus =
          data.status === 'aprobado' ? 'aprobado' : data.status === 'rechazado' ? 'rechazado' : 'pendiente';

        const record: AuthorizedUser = {
          id: typeof data.id === 'string' && data.id ? data.id : `user-${cleanEmail.replace(/[^a-z0-9]/g, '_')}`,
          email: cleanEmail,
          displayName: typeof data.displayName === 'string' && data.displayName ? data.displayName : displayName,
          role,
          status,
          createdAt: typeof data.createdAt === 'string' ? data.createdAt : now,
          ...(typeof data.approvedAt === 'string' ? { approvedAt: data.approvedAt } : {}),
        };
        updateLocalUserRecord(record);

        if (status === 'aprobado') {
          return { authorized: true, role, status: 'aprobado' };
        }
        if (status === 'rechazado') {
          return {
            authorized: false,
            role,
            status: 'rechazado',
            message: 'El acceso para este correo ha sido revocado por el Administrador del Sistema.',
          };
        }
        return {
          authorized: false,
          role,
          status: 'pendiente',
          message: 'Tu solicitud de acceso está registrada y pendiente de aprobación por el Administrador del Sistema.',
        };
      }

      // Nuevo usuario: auto-registro en Firestore con la sesión de Google activa
      const mode = getApprovalMode();
      const initialStatus: UserStatus = mode === 'auto_visitor' ? 'aprobado' : 'pendiente';
      const newRecord: AuthorizedUser = {
        id: `user-${cleanEmail.replace(/[^a-z0-9]/g, '_')}`,
        email: cleanEmail,
        displayName,
        role: 'visitante',
        status: initialStatus,
        createdAt: now,
        ...(initialStatus === 'aprobado' ? { approvedAt: now } : {}),
      };

      // Guardar directamente en Firestore con el token autenticado de Google
      await setDoc(userDocRef, {
        id: newRecord.id,
        email: newRecord.email,
        displayName: newRecord.displayName,
        role: newRecord.role,
        status: newRecord.status,
        createdAt: newRecord.createdAt,
        ...(newRecord.approvedAt ? { approvedAt: newRecord.approvedAt } : {}),
      });

      updateLocalUserRecord(newRecord);

      if (initialStatus === 'aprobado') {
        return { authorized: true, role: 'visitante', status: 'aprobado' };
      }
      return {
        authorized: false,
        role: 'visitante',
        status: 'pendiente',
        message:
          'Tu registro ha sido enviado al Administrador del Sistema en tiempo real. Podrás ingresar como Visitante (consulta) una vez que sea autorizado.',
      };
    }
  } catch (err) {
    console.warn('No se pudo verificar/crear usuario en Firestore:', err);
  }

  // Fallback offline / local
  return checkUserAuthorization(cleanEmail, displayName);
}

let cachedAccessToken: string | null = null;
// Vencimiento (epoch ms) del token en memoria; 0 = desconocido (se vuelve a validar contra el storage).
let cachedAccessTokenExpiresAt = 0;
let cachedUserProfile: UserProfile | null = null;

// Claves heredadas (v1): se siguen leyendo/limpiando para no dejar basura de versiones anteriores.
const LEGACY_TOKEN_KEY = 'icl_intranet_access_token_v1';
const LEGACY_TOKEN_EXPIRY_KEY = 'icl_intranet_token_expiry_v1';
const LEGACY_PROFILE_KEY = 'icl_intranet_user_profile_v1';
const LEGACY_SESSION_EXPIRY_KEY = 'icl_intranet_session_expiry_v1';

// Los access tokens de Google duran ~1 hora. Se guarda su vencimiento REAL (menos un margen),
// no el de la sesión de la intranet: antes se les asignaban 30 días y la app seguía usando
// tokens ya vencidos, lo que terminaba en errores 401 de Google.
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 3600;
const ACCESS_TOKEN_EXPIRY_MARGIN_SECONDS = 60;

function readProfileRaw(): string | null {
  return localStorage.getItem(PROFILE_STORAGE_KEY) || localStorage.getItem(LEGACY_PROFILE_KEY);
}

function readTokenRaw(): string | null {
  return sessionStorage.getItem(TOKEN_STORAGE_KEY) || localStorage.getItem(TOKEN_STORAGE_KEY);
}

function removeTokenKeys(): void {
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_STORAGE_KEY);
  localStorage.removeItem(LEGACY_TOKEN_EXPIRY_KEY);
}

/**
 * Renueva la ventana deslizante de 30 días de la SESIÓN de la intranet.
 * No extiende el vencimiento del access token de Google (ese lo fija Google).
 */
export function touchSession(): void {
  if (typeof window === 'undefined') return;
  try {
    if (!readProfileRaw()) return;
    const now = Date.now();
    localStorage.setItem(SESSION_LAST_ACTIVE_KEY, String(now));
    localStorage.setItem(SESSION_EXPIRY_STORAGE_KEY, String(now + DEFAULT_PERSISTENT_SESSION_MS));
  } catch {
    // Ignore storage quota
  }
}

/**
 * Checks whether the current session has exceeded its persistent validity limit.
 */
export function isSessionExpired(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (!readProfileRaw()) return false;
    const expiryRaw =
      localStorage.getItem(SESSION_EXPIRY_STORAGE_KEY) || localStorage.getItem(LEGACY_SESSION_EXPIRY_KEY);
    if (!expiryRaw) {
      // Sesión previa sin vencimiento explícito: se inicializa la ventana deslizante.
      touchSession();
      return false;
    }
    const expiry = Number(expiryRaw);
    return !isNaN(expiry) && Date.now() >= expiry;
  } catch {
    return false;
  }
}

export function isStoredTokenExpired(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    if (!readTokenRaw()) return true;
    if (isSessionExpired()) return true;

    // Un token sin vencimiento registrado (formato heredado) no es confiable: se trata como vencido.
    const expiryRaw = localStorage.getItem(TOKEN_EXPIRY_STORAGE_KEY);
    if (!expiryRaw) return true;
    const expiry = Number(expiryRaw);
    return isNaN(expiry) || Date.now() >= expiry;
  } catch {
    return true;
  }
}

export function getStoredAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    if (isSessionExpired()) {
      cachedAccessToken = null;
      cachedUserProfile = null;
      storeAccessToken(null);
      storeUserProfile(null);
      return null;
    }
    if (isStoredTokenExpired()) {
      removeTokenKeys();
      cachedAccessToken = null;
      return null;
    }
    return readTokenRaw();
  } catch {
    return null;
  }
}

/**
 * Guarda el access token de Google con su vencimiento real.
 * @param expiresInSeconds duración informada por Google (por defecto 3600 s).
 */
export function storeAccessToken(token: string | null, expiresInSeconds?: number) {
  if (typeof window === 'undefined') return;
  try {
    if (token) {
      const ttlSeconds =
        expiresInSeconds && expiresInSeconds > 0 ? expiresInSeconds : DEFAULT_ACCESS_TOKEN_TTL_SECONDS;
      const effectiveSeconds = Math.max(ttlSeconds - ACCESS_TOKEN_EXPIRY_MARGIN_SECONDS, 60);
      const expiryTimestamp = Date.now() + effectiveSeconds * 1000;

      sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
      localStorage.setItem(TOKEN_EXPIRY_STORAGE_KEY, String(expiryTimestamp));
      cachedAccessToken = token;
      cachedAccessTokenExpiresAt = expiryTimestamp;
      touchSession();
    } else {
      removeTokenKeys();
      cachedAccessToken = null;
      cachedAccessTokenExpiresAt = 0;
    }
  } catch {
    // Ignore storage quota
  }
}

export function getStoredUserProfile(): UserProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    if (isSessionExpired()) {
      cachedUserProfile = null;
      cachedAccessToken = null;
      storeAccessToken(null);
      storeUserProfile(null);
      return null;
    }
    const raw = readProfileRaw();
    if (!raw) return null;
    const profile = JSON.parse(raw);
    if (profile && !localStorage.getItem(PROFILE_STORAGE_KEY)) {
      // Migrate backwards compatible storage
      localStorage.setItem(PROFILE_STORAGE_KEY, raw);
    }
    if (profile && isAllowedVisitorEmail(profile.email)) {
      if (profile.role !== 'visitante' || profile.status !== 'aprobado') {
        profile.role = 'visitante';
        profile.status = 'aprobado';
        localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
        cachedUserProfile = profile;
      }
    }
    return profile;
  } catch {
    return null;
  }
}

export function storeUserProfile(profile: UserProfile | null) {
  if (typeof window === 'undefined') return;
  try {
    if (profile) {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
      cachedUserProfile = profile;
      saveRememberedDeviceUser(profile);
      touchSession();
    } else {
      localStorage.removeItem(PROFILE_STORAGE_KEY);
      localStorage.removeItem(LEGACY_PROFILE_KEY);
      localStorage.removeItem(SESSION_EXPIRY_STORAGE_KEY);
      localStorage.removeItem(LEGACY_SESSION_EXPIRY_KEY);
      localStorage.removeItem(SESSION_LAST_ACTIVE_KEY);
      cachedUserProfile = null;
    }
  } catch {
    // Ignore storage errors
  }
}

export const REMEMBERED_DEVICE_USER_KEY = 'icl_intranet_remembered_device_user_v1';

export interface RememberedDeviceUser {
  email: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  lastLoginAt: string;
}

export function getRememberedDeviceUser(): RememberedDeviceUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(REMEMBERED_DEVICE_USER_KEY);
    if (!raw) {
      const active = getStoredUserProfile();
      if (active && active.email) {
        return {
          email: active.email,
          displayName: active.displayName || active.email.split('@')[0],
          role: active.role || 'visitante',
          status: active.status || 'aprobado',
          lastLoginAt: new Date().toISOString(),
        };
      }
      return null;
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.email === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveRememberedDeviceUser(user: {
  email: string;
  displayName?: string;
  role?: UserRole;
  status?: UserStatus;
}): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: RememberedDeviceUser = {
      email: user.email.trim().toLowerCase(),
      displayName: user.displayName || user.email.split('@')[0],
      role: user.role || 'visitante',
      status: user.status || 'aprobado',
      lastLoginAt: new Date().toISOString(),
    };
    localStorage.setItem(REMEMBERED_DEVICE_USER_KEY, JSON.stringify(payload));
  } catch {
    // Ignore
  }
}

export function clearRememberedDeviceUser(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(REMEMBERED_DEVICE_USER_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Initializes authentication listener with Firebase (including redirect result recovery
 * for mobile/Vercel/Shopify) and resilient local session retention.
 */
export const initAuth = (
  onAuthSuccess?: (profile: UserProfile, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  const activeAuth = getActiveAuth();
  void ensureResilientPersistence(activeAuth);

  // 1. Recover existing verified session immediately to avoid UI flicker
  const savedProfile = getStoredUserProfile();
  if (savedProfile) {
    const authCheck = checkUserAuthorization(savedProfile.email, savedProfile.displayName);
    if (authCheck.authorized) {
      savedProfile.role = authCheck.role;
      savedProfile.status = authCheck.status;
      cachedUserProfile = savedProfile;
      cachedAccessToken = getStoredAccessToken();
      // Sesión aprobada restaurada: se abren los listeners de sincronización.
      applySyncGate(true);
      if (onAuthSuccess) {
        onAuthSuccess(savedProfile, cachedAccessToken);
      }
    } else {
      applySyncGate(false);
      storeUserProfile(null);
      storeAccessToken(null);
    }
  }

  // 2. Check if returning from a signInWithRedirect flow (mobile / popup-blocked browsers)
  if (typeof window !== 'undefined') {
    getRedirectResult(activeAuth)
      .then(async (redirectResult) => {
        if (!redirectResult || !redirectResult.user) return;
        const credential = GoogleAuthProvider.credentialFromResult(redirectResult);
        if (credential?.accessToken) {
          cachedAccessToken = credential.accessToken;
          storeAccessToken(cachedAccessToken);
        }
        const email = redirectResult.user.email || '';
        const displayName =
          redirectResult.user.displayName || email.split('@')[0] || 'Usuario Google';
        const authCheck = await syncAndCheckUserInFirestore(redirectResult.user, displayName);
        if (!authCheck.authorized) {
          applySyncGate(false);
          await signOut(activeAuth);
          storeAccessToken(null);
          storeUserProfile(null);
          if (onAuthFailure) onAuthFailure();
          return;
        }
        const profile: UserProfile = {
          uid: redirectResult.user.uid,
          email,
          displayName,
          photoURL: redirectResult.user.photoURL || null,
          role: authCheck.role,
          status: authCheck.status,
          provider: 'google',
        };
        cachedUserProfile = profile;
        storeUserProfile(profile);
        applySyncGate(true);
        if (onAuthSuccess) {
          onAuthSuccess(profile, cachedAccessToken);
        }
      })
      .catch((err) => {
        console.warn('Firebase getRedirectResult check:', err?.code || err?.message);
      });
  }

  // 3. Subscribe to Firebase Auth state changes
  return onAuthStateChanged(activeAuth, async (firebaseUser: User | null) => {
    if (firebaseUser) {
      if (!cachedAccessToken) {
        cachedAccessToken = getStoredAccessToken();
      }
      const email = firebaseUser.email || '';
      const authCheck = await syncAndCheckUserInFirestore(firebaseUser, firebaseUser.displayName || '');

      if (!authCheck.authorized) {
        applySyncGate(false);
        await signOut(activeAuth);
        cachedAccessToken = null;
        cachedUserProfile = null;
        storeAccessToken(null);
        storeUserProfile(null);
        if (onAuthFailure) {
          onAuthFailure();
        }
        return;
      }

      const profile: UserProfile = {
        uid: firebaseUser.uid,
        email: email,
        displayName: firebaseUser.displayName || email.split('@')[0] || 'Usuario',
        photoURL: firebaseUser.photoURL || null,
        role: authCheck.role,
        status: authCheck.status,
        provider: 'google',
      };
      cachedUserProfile = profile;
      storeUserProfile(profile);
      if (onAuthSuccess) {
        onAuthSuccess(profile, cachedAccessToken);
      }
    } else {
      // Preserve valid stored sessions (both 'google' and 'institucional') across reloads
      // in environments where third-party IndexedDB is partitioned (e.g., Shopify iframes, Safari ITP)
      const currentStored = getStoredUserProfile();
      if (currentStored) {
        const authCheck = checkUserAuthorization(currentStored.email, currentStored.displayName);
        // Un perfil guardado solo en el navegador (localStorage) no prueba identidad. Para conservar
        // privilegios de administrador SIN sesión activa de Firebase se exige además un access token
        // de Google vigente; si no lo hay, el administrador debe volver a iniciar sesión con Google.
        const stillVerifiable = authCheck.role !== 'administrador' || getStoredAccessToken() !== null;
        if (authCheck.authorized && stillVerifiable) {
          currentStored.role = authCheck.role;
          currentStored.status = authCheck.status;
          cachedUserProfile = currentStored;
          cachedAccessToken = getStoredAccessToken();
          applySyncGate(true);
          if (onAuthSuccess) {
            onAuthSuccess(currentStored, cachedAccessToken);
          }
          return;
        }
      }
      // Sin datos de perfil verificables (sesión de Firebase cerrada): listo el gate.
      applySyncGate(false);
      cachedAccessToken = null;
      cachedUserProfile = null;
      storeAccessToken(null);
      storeUserProfile(null);
      if (onAuthFailure) {
        onAuthFailure();
      }
    }
  });
};

export interface SignInResult {
  profile: UserProfile;
  accessToken: string | null;
}

export interface GoogleSignInOptions {
  includeWorkspaceScopes?: boolean;
  forceConsent?: boolean;
}

/**
 * Formats Firebase Auth errors with actionable, environment-aware diagnostics
 * (especially for Vercel, Shopify, and custom domains).
 */
function enrichFirebaseError(error: unknown): Error {
  const code = (error as { code?: string } | null)?.code || '';
  const { hostname, config } = getEffectiveFirebaseConfig();

  switch (code) {
    case 'auth/unauthorized-domain':
      return codedError(
        `El dominio actual (${hostname}) aún no está autorizado en el proyecto Firebase (${config.projectId}). Agrégalo en Firebase Console → Authentication → Settings → Authorized domains, o usa el método de Token OAuth Directo.`,
        code,
        { hostname, projectId: config.projectId }
      );
    case 'auth/popup-closed-by-user':
      return codedError('La ventana emergente de Google fue cerrada antes de completar el inicio de sesión.', code);
    case 'auth/popup-blocked':
      return codedError(
        'El navegador bloqueó la ventana emergente de Google. Puedes usar el botón "Iniciar por Redirección (Sin Popup)" o habilitar las ventanas emergentes.',
        code
      );
    case 'auth/cancelled-popup-request':
      return codedError('Solicitud anterior cancelada. Por favor, vuelve a intentar iniciar sesión.', code);
    case 'auth/operation-not-supported-in-this-environment':
      return codedError(
        'El entorno actual restringe el almacenamiento para ventanas emergentes de Firebase. Utiliza el botón de Acceso OAuth Directo (GIS) o Redirección.',
        code
      );
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid':
      return codedError(
        `La clave API Key de Firebase (${config.projectId}) no es válida. Verifica la configuración en la pestaña "Firebase / Despliegue".`,
        'auth/invalid-api-key'
      );
    case 'auth/operation-not-allowed':
      return codedError(
        `El proveedor Google Sign-In no está habilitado en tu proyecto Firebase (${config.projectId}). Actívalo en Firebase Console → Authentication → Sign-in method → Google.`,
        code
      );
    default:
      return error instanceof Error ? error : new Error(String(error));
  }
}

/**
 * Google Sign In with Firebase popup, automatic scope fallback, and role enforcement.
 */
export const googleSignIn = async (options?: GoogleSignInOptions): Promise<SignInResult> => {
  const includeWorkspace = options?.includeWorkspaceScopes ?? false;
  const forceConsent = options?.forceConsent ?? false;
  const activeAuth = getActiveAuth();
  await ensureResilientPersistence(activeAuth);

  try {
    let result;
    try {
      const primaryProvider = createGoogleProvider(includeWorkspace, forceConsent);
      result = await signInWithPopup(activeAuth, primaryProvider);
    } catch (popupErr: unknown) {
      /**
       * Resilencia del popup: en dev, el overlay de Next pone COOP (Cross-Origin-Opener-Policy)
       * y rompe la comunicación del popup de Google ("window.closed" bloqueado), además de los
       * casos clásicos de popup bloqueado. En esos casos se continua AUTOMÁTICAMENTE por
       * REDIRECCIÓN (mismo login, sin popup): es el flujo que ya existe para móvil.
       */
      const code = (popupErr as { code?: string } | null)?.code ?? '';
      const popupFamilyCodes = [
        'auth/popup-blocked',
        'auth/popup-closed-by-user',
        'auth/cancelled-popup-request',
        'auth/operation-not-supported-in-this-environment',
        'auth/popup-redirect-request-pending-failure',
        'auth/timeout',
      ];
      if (popupFamilyCodes.includes(code)) {
        await googleSignInWithRedirect(includeWorkspace);
        // signInWithRedirect navega a Google y vuelve al callback en getRedirectResult:
        // el promise queda congelado con intención (la página se va de ida).
        return new Promise<SignInResult>(() => {});
      }
      // If Workspace scopes caused an OAuth client/scope error or was blocked on an unverified project,
      // automatically retry with basic Google Identity (email + profile) so login succeeds.
      if (includeWorkspace) {
        try {
          const fallbackProvider = createGoogleProvider(false, false);
          result = await signInWithPopup(activeAuth, fallbackProvider);
        } catch {
          // La alternativa sin scopes también falló (p. ej. popup/COOP): redirección final.
          await googleSignInWithRedirect(false);
          return new Promise<SignInResult>(() => {});
        }
      } else {
        throw popupErr;
      }
    }

    const credential = GoogleAuthProvider.credentialFromResult(result);
    cachedAccessToken = credential?.accessToken || null;
    storeAccessToken(cachedAccessToken);

    const email = result.user.email || '';
    const displayName = result.user.displayName || email.split('@')[0] || 'Usuario Google';

    // Verify approval directly in Firestore while Google auth is active
    const authCheck = await syncAndCheckUserInFirestore(result.user, displayName);
    if (!authCheck.authorized) {
      await signOut(activeAuth);
      storeAccessToken(null);
      throw codedError(
        authCheck.message ||
          'Tu solicitud de acceso está pendiente de aprobación por el Administrador del Sistema.',
        'auth/pending-approval'
      );
    }

    const profile: UserProfile = {
      uid: result.user.uid,
      email: email,
      displayName: displayName,
      photoURL: result.user.photoURL || null,
      role: authCheck.role,
      status: authCheck.status,
      provider: 'google',
    };
    cachedUserProfile = profile;
    storeUserProfile(profile);

    return { profile, accessToken: cachedAccessToken };
  } catch (error: unknown) {
    const info = error as { code?: string; message?: string } | null;
    console.warn('Firebase signInWithPopup:', info?.code || info?.message);
    if (info?.code === 'auth/pending-approval') {
      throw error;
    }
    throw enrichFirebaseError(error);
  }
};

/**
 * Initiates Google Sign-In via full-page redirect (ideal for mobile browsers or WebViews
 * on Vercel / standalone domains where popups are blocked).
 */
export const googleSignInWithRedirect = async (
  includeWorkspaceScopes = false
): Promise<void> => {
  const activeAuth = getActiveAuth();
  await ensureResilientPersistence(activeAuth);
  const redirectProvider = createGoogleProvider(includeWorkspaceScopes, false);
  try {
    await signInWithRedirect(activeAuth, redirectProvider);
  } catch (error: unknown) {
    throw enrichFirebaseError(error);
  }
};

interface GisTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GisTokenClientConfig {
  client_id: string;
  scope: string;
  prompt: string;
  callback: (resp: GisTokenResponse) => void;
  error_callback: (err: { message?: string }) => void;
}

interface GisWindow extends Window {
  google?: {
    accounts?: {
      oauth2?: {
        initTokenClient: (config: GisTokenClientConfig) => { requestAccessToken: () => void };
      };
    };
  };
}

/**
 * Dynamically loads the official Google Identity Services (GIS) client script if needed.
 */
function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Entorno de navegador no disponible.'));
  }
  if ((window as GisWindow).google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () =>
        reject(new Error('No se pudo cargar el script de Google Identity Services.'))
      );
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error('No se pudo conectar con Google Identity Services (accounts.google.com).'));
    document.head.appendChild(script);
  });
}

/**
 * Direct Google Identity Services (GIS) OAuth2 Token Client Sign-In.
 * Useful in embedded environments (such as Shopify iframes) or when authenticating directly
 * via an OAuth Client ID, bridging into Firebase Auth via signInWithCredential when possible.
 */
export const googleGisSignIn = async (
  includeWorkspaceScopes = false
): Promise<SignInResult> => {
  const { config } = getEffectiveFirebaseConfig();
  const clientId = config.oAuthClientId;
  if (!clientId) {
    throw new Error(
      'No hay un OAuth Client ID configurado. Ingresa tu Google OAuth Client ID en la pestaña "Firebase / Despliegue".'
    );
  }

  await loadGoogleIdentityScript();

  const scopes = [
    'openid',
    'email',
    'profile',
    ...(includeWorkspaceScopes ? WORKSPACE_SCOPES : []),
  ].join(' ');

  const tokenResponse = await new Promise<{ access_token: string; expires_in?: number }>((resolve, reject) => {
    try {
      const gis = (window as GisWindow).google?.accounts?.oauth2;
      if (!gis) {
        reject(new Error('Google Identity Services no está disponible en este navegador.'));
        return;
      }
      const tokenClient = gis.initTokenClient({
        client_id: clientId,
        scope: scopes,
        prompt: 'select_account',
        callback: (resp) => {
          if (resp?.error) {
            reject(new Error(resp.error_description || resp.error || 'Error de autorización OAuth.'));
            return;
          }
          if (!resp?.access_token) {
            reject(new Error('No se recibió un token de acceso desde Google.'));
            return;
          }
          resolve({ access_token: resp.access_token, expires_in: resp.expires_in });
        },
        error_callback: (err) => {
          reject(
            new Error(
              err?.message || 'Se cerró o bloqueó el diálogo de Google Identity Services.'
            )
          );
        },
      });
      tokenClient.requestAccessToken();
    } catch (e) {
      reject(e);
    }
  });

  const accessToken = tokenResponse.access_token;

  // Fetch verified Google user info using the OAuth2 access token
  const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!userInfoRes.ok) {
    throw new Error('No se pudo verificar la identidad del usuario con Google.');
  }

  const userInfo = await userInfoRes.json();
  if (userInfo.email_verified === false) {
    throw codedError(
      'Google informa que el correo de esta cuenta no está verificado, por lo que no puede usarse para ingresar.',
      'auth/email-not-verified'
    );
  }
  const email = String(userInfo.email || '').trim();
  const displayName = String(userInfo.name || email.split('@')[0] || 'Usuario Google').trim();
  const photoURL = userInfo.picture ? String(userInfo.picture) : null;
  let uid = String(userInfo.sub || 'gis-' + Date.now());

  // Bridge credential into Firebase Auth if the domain is authorized in Firebase
  try {
    const activeAuth = getActiveAuth();
    await ensureResilientPersistence(activeAuth);
    const firebaseCred = GoogleAuthProvider.credential(null, accessToken);
    const fbResult = await signInWithCredential(activeAuth, firebaseCred);
    if (fbResult?.user?.uid) {
      uid = fbResult.user.uid;
    }
  } catch (bridgeErr) {
    // Even if Firebase domain check blocks signInWithCredential, the user's identity
    // and token have just been cryptographically verified directly against Google's OAuth2 API.
    console.warn('Firebase credential bridge notice:', bridgeErr);
  }

  const activeAuth = getActiveAuth();
  const fbUser = activeAuth.currentUser;
  const authCheck = fbUser
    ? await syncAndCheckUserInFirestore(fbUser, displayName)
    : checkUserAuthorization(email, displayName);
  if (!authCheck.authorized) {
    storeAccessToken(null);
    throw codedError(
      authCheck.message ||
        'Tu solicitud de acceso está pendiente de aprobación por el Administrador del Sistema.',
      'auth/pending-approval'
    );
  }

  cachedAccessToken = accessToken;
  storeAccessToken(accessToken, tokenResponse.expires_in || 3600);

  const profile: UserProfile = {
    uid,
    email,
    displayName,
    photoURL,
    role: authCheck.role,
    status: authCheck.status,
    provider: 'google',
  };

  cachedUserProfile = profile;
  storeUserProfile(profile);

  return { profile, accessToken };
};

/**
 * Direct institutional sign-in:
 * SECURITY RULE:
 * The Administrator account CANNOT be accessed by merely typing an email!
 * Anyone typing the admin email directly without Google verification is blocked.
 * Non-admin employees log in strictly with role Visitante (read-only).
 */
export const institutionalSignIn = (data: {
  displayName: string;
  email: string;
}): UserProfile => {
  const cleanEmail = data.email.trim();
  const cleanName = data.displayName.trim();

  // If someone attempts to claim the Administrator email in direct text input:
  if (isMasterAdminEmail(cleanEmail)) {
    // Only allow if this exact browser already has a verified Google session stored in localStorage
    const saved = getStoredUserProfile();
    if (saved && isMasterAdminEmail(saved.email) && saved.provider === 'google') {
      return saved;
    }
    throw codedError(
      'Por seguridad, la cuenta de Administrador requiere autenticación obligatoria mediante Google Sign-In ("Continuar con Google").',
      'auth/admin-requires-oauth'
    );
  }

  const authCheck = checkUserAuthorization(cleanEmail, cleanName);
  if (!authCheck.authorized) {
    throw codedError(
      'Para registrar tu solicitud de acceso y verificar tu identidad institucional por primera vez, por favor utiliza la pestaña "Cuenta Google" ("Continuar con Google").',
      'auth/pending-approval'
    );
  }

  const profile: UserProfile = {
    uid: 'inst-' + Date.now(),
    displayName: cleanName || 'Visitante Institucional',
    email: cleanEmail,
    photoURL: null,
    role: 'visitante', // Always strictly visitor for direct entries
    status: authCheck.status,
    provider: 'institucional',
  };
  cachedUserProfile = profile;
  storeUserProfile(profile);
  return profile;
};

/**
 * ID token de Firebase del usuario actual (para autenticar llamadas a nuestras rutas /api).
 * Devuelve null si no hay una sesión de Firebase (ej. ingreso institucional solo con email).
 * Firebase renueva el token automáticamente cuando está por vencer.
 */
/**
 * Espera a que Firebase resuelva su estado de autenticación (persistencia en IndexedDB
 * puede tardar): evita la carrera de leer currentUser demasiado temprano y concluir
 * "no hay sesión de Google" erróneamente (afectaba el diagnóstico y el ID token).
 */
async function waitForAuthUser(targetAuth: Auth): Promise<User | null> {
  if (targetAuth.currentUser) return targetAuth.currentUser;
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(targetAuth, (u) => {
      unsubscribe();
      resolve(u);
    });
  });
}

export const getFirebaseIdToken = async (): Promise<string | null> => {
  try {
    const user = await waitForAuthUser(getActiveAuth());
    return user ? await user.getIdToken() : null;
  } catch (e) {
    console.warn('No se pudo obtener el ID token de Firebase:', e);
    return null;
  }
};

/** Email REAL de la sesión de Google activa en Firebase ("" si no hay). */
export function getFirebaseAuthEmail(): string {
  if (typeof window === 'undefined') return '';
  try {
    return getActiveAuth().currentUser?.email ?? '';
  } catch {
    return '';
  }
}

export const getAccessToken = async (): Promise<string | null> => {
  // El token en memoria solo es válido hasta su vencimiento real (~1 h): pasado ese momento se
  // revalida contra el storage, que lo descarta si venció, en vez de devolver un token caducado.
  if (cachedAccessToken && cachedAccessTokenExpiresAt > Date.now()) {
    return cachedAccessToken;
  }
  cachedAccessToken = getStoredAccessToken();
  if (!cachedAccessToken) cachedAccessTokenExpiresAt = 0;
  return cachedAccessToken;
};

export const setAccessTokenManually = (token: string | null) => {
  cachedAccessToken = token;
  storeAccessToken(token);
};

export const getCurrentUserProfile = (): UserProfile | null => {
  if (!cachedUserProfile) {
    cachedUserProfile = getStoredUserProfile();
  }
  return cachedUserProfile;
};

export const logout = async (): Promise<void> => {
  // Sin sesión autorizada: cierra el gate de sincronización (los listeners morirán
  // solos con el siguiente permission-denied, pero no disparan avisos al usuario).
  applySyncGate(false);
  try {
    const activeAuth = getActiveAuth();
    await signOut(activeAuth);
  } catch (e) {
    console.error('Error al cerrar sesión en Firebase:', e);
  }
  cachedAccessToken = null;
  cachedUserProfile = null;
  storeAccessToken(null);
  storeUserProfile(null);
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(SESSION_EXPIRY_STORAGE_KEY);
      localStorage.removeItem(LEGACY_SESSION_EXPIRY_KEY);
      localStorage.removeItem(SESSION_LAST_ACTIVE_KEY);
      localStorage.removeItem(TOKEN_EXPIRY_STORAGE_KEY);
      localStorage.removeItem(LEGACY_TOKEN_EXPIRY_KEY);
      sessionStorage.clear();
    } catch {
      // Ignore storage cleanup issues
    }
  }
};
