/**
 * Lógica pura de sincronización entre la copia local (localStorage) y Firestore.
 *
 * Sin dependencias de Firebase ni del navegador: se puede probar de forma aislada.
 *
 * Idea: cada vez que llega el estado remoto de una colección (snapshot) hay que decidir qué
 * queda en la copia local. Para no perder cambios ni resucitar borrados se compara contra
 * `previousKnown`: la huella (hash) de cada documento en el ÚLTIMO estado en que local y
 * remoto coincidieron. Con eso, para cada documento:
 *
 *   - local == remoto                        → igual en ambos lados.
 *   - local == conocido, remoto distinto     → cambió otro usuario: gana el remoto.
 *   - local != conocido                      → hay un cambio local sin enviar: se conserva y se envía.
 *   - solo remoto                            → documento nuevo de otro usuario: se agrega.
 *   - solo local, estaba en lo conocido      → otro usuario lo BORRÓ: se quita (salvo que haya
 *                                              una edición local posterior: se conserva y se envía).
 *   - solo local, NO estaba en lo conocido   → alta local que nunca se envió: se conserva y se envía.
 *
 * Si no hay estado conocido (`previousKnown === null`, primera sincronización de este navegador)
 * se mantiene el comportamiento histórico: manda el remoto; y si el remoto está vacío se siembra
 * lo local.
 *
 * Limitación conocida: un borrado local que no llegó a enviarse y se perdió al recargar NO se
 * infiere (el documento reaparece desde el remoto). Es la opción segura: nunca borra datos
 * compartidos por una deducción.
 */

type Doc = Record<string, unknown>;

/** Huella de 53 bits (cyrb53). Suficiente para detectar cambios; no es criptográfica. */
function cyrb53(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${str.length.toString(36)}-${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}`;
}

/** JSON con claves ordenadas: el mismo contenido da siempre el mismo texto, sin importar el orden. */
function stable(value: unknown, topLevel: boolean): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    return `[${value.map((v) => (v === undefined || typeof v === 'function' ? 'null' : stable(v, false))).join(',')}]`;
  }
  if (typeof value === 'object') {
    const obj = value as Doc;
    const keys = Object.keys(obj)
      .filter((k) => !(topLevel && k === '__id') && obj[k] !== undefined && typeof obj[k] !== 'function')
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stable(obj[k], false)}`).join(',')}}`;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  return JSON.stringify(value) ?? 'null';
}

/**
 * Huella del CONTENIDO de un documento. Ignora `__id` (campo interno de lectura), el orden de las
 * claves y los valores `undefined`, igual que lo que realmente se escribe en Firestore.
 */
export function docHash(item: Doc): string {
  return cyrb53(stable(item, true));
}

export type KnownHashes = Map<string, string>;

function idOf(item: Doc): string {
  return String(item.id ?? item.__id ?? '');
}

/** Copia sin campos internos de lectura; garantiza `id` (el del documento si faltara). */
function clean(item: Doc): Doc {
  const { __id, ...rest } = item;
  if (rest.id === undefined && typeof __id === 'string' && __id) return { ...rest, id: __id };
  return rest;
}

export interface MergeParams {
  /** Copia local actual de la colección. */
  local: Doc[];
  /** Documentos que acaban de llegar de Firestore (con `__id` = id del documento). */
  remote: Doc[];
  /** Huellas del último estado sincronizado, o null si es la primera sincronización. */
  previousKnown: KnownHashes | null;
}

export interface MergeResult {
  /** Lista resultante (sin ordenar y sin `__id`). */
  merged: Doc[];
  /** TRUE si quedaron cambios locales que Firestore todavía no tiene (hay que enviarlos). */
  hasPending: boolean;
}

export function mergeRemoteSnapshot({ local, remote, previousKnown }: MergeParams): MergeResult {
  const remoteById = new Map<string, Doc>();
  for (const r of remote) {
    const id = idOf(r);
    if (id) remoteById.set(id, clean(r));
  }
  const localById = new Map<string, Doc>();
  const localWithoutId: Doc[] = [];
  for (const l of local) {
    const id = String(l.id ?? '');
    if (id) localById.set(id, clean(l));
    else localWithoutId.push(clean(l));
  }

  const merged = new Map<string, Doc>();
  let hasPending = false;

  for (const [id, r] of remoteById) {
    const l = localById.get(id);
    if (!l) {
      merged.set(id, r);
      continue;
    }
    const hl = docHash(l);
    const hr = docHash(r);
    if (hl === hr || previousKnown === null) {
      merged.set(id, r);
      continue;
    }
    const known = previousKnown.get(id);
    if (known === undefined || hl === known) {
      merged.set(id, r); // sin cambios locales: manda lo que cambió otro usuario
    } else {
      merged.set(id, l); // cambio local sin enviar (o conflicto): se conserva la edición propia
      hasPending = true;
    }
  }

  for (const [id, l] of localById) {
    if (remoteById.has(id)) continue;
    if (previousKnown === null) {
      // Primera sincronización: con remoto vacío se siembra lo local; con remoto cargado manda el remoto.
      if (remoteById.size === 0) {
        merged.set(id, l);
        hasPending = true;
      }
      continue;
    }
    const known = previousKnown.get(id);
    if (known === undefined) {
      merged.set(id, l); // alta local nunca enviada
      hasPending = true;
    } else if (docHash(l) !== known) {
      merged.set(id, l); // se editó localmente después de que otro usuario lo borrara
      hasPending = true;
    }
    // else: otro usuario lo borró y acá no se tocó → se quita de la copia local.
  }

  return { merged: [...merged.values(), ...localWithoutId], hasPending };
}

/* ─────────────────────── Documentos individuales (por campo) ─────────────────────── */

/**
 * Documentos individuales (ej. settings/app): la misma idea que arriba pero por CAMPO de primer nivel.
 * Así dos administradores que cambian campos distintos no se pisan: cada guardado envía solo lo que
 * cambió ese navegador (ver `changedFields`) y cada snapshot se mezcla campo a campo.
 * Si los dos cambian EL MISMO campo, gana la edición local (última escritura gana: no hay control de
 * concurrencia).
 */
export type FieldHashes = Record<string, string>;

/** Huella de cada campo de primer nivel (se ignoran los `undefined`). */
export function fieldHashes(obj: Doc): FieldHashes {
  const out: FieldHashes = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || typeof v === 'function') continue;
    out[k] = cyrb53(stable(v, false));
  }
  return out;
}

export interface FieldChanges {
  /** Campos nuevos o con contenido distinto al último sincronizado. */
  changed: string[];
  /** Campos que estaban sincronizados y ya no existen en la copia local. */
  removed: string[];
}

/** Qué campos de `current` difieren de lo último sincronizado (`known`). */
export function changedFields(current: FieldHashes, known: FieldHashes): FieldChanges {
  const changed = Object.keys(current).filter((k) => current[k] !== known[k]);
  const removed = Object.keys(known).filter((k) => !(k in current));
  return { changed, removed };
}

export interface DocFieldsMergeResult {
  /** Documento resultante: lo remoto, salvo los campos con cambio local sin enviar. */
  merged: Doc;
  /** Campos con cambio local que Firestore todavía no tiene (hay que enviarlos). */
  pendingFields: string[];
  /** Campos que el usuario quitó localmente y Firestore todavía conserva. */
  pendingRemovals: string[];
}

export function mergeDocFields(params: {
  local: Doc;
  remote: Doc;
  /** Huellas por campo del último estado sincronizado, o null si es la primera sincronización. */
  knownFields: FieldHashes | null;
}): DocFieldsMergeResult {
  const { local, remote, knownFields } = params;
  // Sin estado conocido: comportamiento histórico, manda el remoto.
  if (!knownFields) return { merged: { ...remote }, pendingFields: [], pendingRemovals: [] };

  const lh = fieldHashes(local);
  const rh = fieldHashes(remote);
  const merged: Doc = {};
  const pendingFields: string[] = [];
  const pendingRemovals: string[] = [];

  for (const k of new Set([...Object.keys(lh), ...Object.keys(rh)])) {
    const inLocal = k in lh;
    const inRemote = k in rh;
    if (inLocal && inRemote && lh[k] === rh[k]) {
      merged[k] = remote[k];
      continue;
    }
    const kh = knownFields[k];
    if (kh === undefined) {
      // Campo que nunca estuvo sincronizado: si solo existe acá es un alta local sin enviar; si no, manda el remoto.
      if (inLocal && !inRemote) {
        merged[k] = local[k];
        pendingFields.push(k);
      } else if (inRemote) {
        merged[k] = remote[k];
      }
      continue;
    }
    if (inLocal && lh[k] === kh) {
      // Sin cambios locales: manda lo que cambió otro usuario (incluido que lo haya quitado).
      if (inRemote) merged[k] = remote[k];
      continue;
    }
    // Cambio local sin enviar (o conflicto sobre el mismo campo): se conserva la edición propia.
    if (inLocal) {
      merged[k] = local[k];
      pendingFields.push(k);
    } else {
      pendingRemovals.push(k);
    }
  }
  return { merged, pendingFields, pendingRemovals };
}
