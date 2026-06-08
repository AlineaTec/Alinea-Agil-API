/**
 * Parámetros conservadores para Fase B (REG-VERIFY, api-needs.md).
 * TODO [P]: sustituir por configuración o decisión de negocio cerrada.
 */
export const VERIFICATION_CODE_LENGTH = 6

/** Ventana de validez del código recién emitido. */
export const VERIFICATION_CHALLENGE_TTL_MS = 15 * 60 * 1000

/**
 * Tope de comprobaciones fallidas por desafío (verificación futura).
 * No aplica al envío en sí; deja base para la siguiente operación.
 */
export const VERIFICATION_MAX_WRONG_ATTEMPTS = 5
