/**
 * Rate limiter simple de ventana fija, en memoria.
 *
 * Válido para un único proceso (MVP en un solo servidor). Si la plataforma
 * escala a más de una instancia, cambiar el backend a Redis usando
 * `RATE_LIMIT_BACKEND=redis` y `REDIS_URL` (ver `.env.example`); la firma de
 * `checkRateLimit` se mantendría igual para no tocar los endpoints.
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, resetAt: existing.resetAt };
}

/** Límites por endpoint sensible (ver Módulo 1, sección 11 y Módulo 10). */
export const RATE_LIMITS = {
  login: { limit: 5, windowMs: 5 * 60 * 1000 },
  // Shared school Wi-Fi must allow a class to register and sign in.
  loginIp: { limit: 60, windowMs: 5 * 60 * 1000 },
  register: { limit: 60, windowMs: 60 * 60 * 1000 },
  activateLicense: { limit: 60, windowMs: 15 * 60 * 1000 },
  passwordReset: { limit: 3, windowMs: 60 * 60 * 1000 },
  passwordResetIp: { limit: 60, windowMs: 60 * 60 * 1000 },
} as const;
