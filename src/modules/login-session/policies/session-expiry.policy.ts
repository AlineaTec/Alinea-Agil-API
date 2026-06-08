const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 días

/**
 * TTL de sesión en milisegundos. `LOGIN_SESSION_TTL_MS` opcional (entero > 0).
 * Renovación / sliding window **[P]**.
 */
export function loginSessionTtlMs(): number {
  const raw = process.env.LOGIN_SESSION_TTL_MS?.trim()
  if (!raw) return DEFAULT_SESSION_TTL_MS
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_SESSION_TTL_MS
  return n
}

export function loginSessionExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + loginSessionTtlMs())
}
