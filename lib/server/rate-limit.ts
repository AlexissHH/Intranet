/**
 * Limitador de uso por ventana deslizante, en memoria.
 *
 * Limitación conocida (honesta): en Vercel cada instancia serverless tiene su
 * propia memoria, así que el límite es "por instancia", no global. Sirve como
 * freno contra abuso y errores (bucles en el cliente) pero NO reemplaza un
 * límite global. Para eso, usar Upstash Redis / Vercel KV y, además, configurar
 * una cuota/presupuesto en el proyecto de Google Cloud de la API key.
 */

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();
const MAX_TRACKED_KEYS = 5000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Segundos hasta que se libera un cupo (0 si está permitido). */
  retryAfterSeconds: number;
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now()
): RateLimitResult {
  const windowStart = now - windowMs;

  // Limpieza defensiva para que el Map no crezca sin control.
  if (buckets.size > MAX_TRACKED_KEYS) {
    for (const [k, b] of buckets) {
      if (b.hits.every((t) => t <= windowStart)) buckets.delete(k);
    }
    if (buckets.size > MAX_TRACKED_KEYS) buckets.clear();
  }

  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => t > windowStart);

  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0];
    buckets.set(key, bucket);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { allowed: true, remaining: limit - bucket.hits.length, retryAfterSeconds: 0 };
}

/** Solo para tests. */
export function __resetRateLimitForTests(): void {
  buckets.clear();
}
