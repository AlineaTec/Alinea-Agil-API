/**
 * TTL del intento de registro en memoria persistente.
 * TODO [P]: sustituir por valor de configuración / negocio (open-questions.md n.º 13).
 */
export const DEFAULT_REGISTRATION_INTENT_TTL_MS = 24 * 60 * 60 * 1000

export function defaultIntentExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + DEFAULT_REGISTRATION_INTENT_TTL_MS)
}
