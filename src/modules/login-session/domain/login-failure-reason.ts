/**
 * Razones de fallo de login expuestas al cliente (política uniforme **[P]**).
 * Por ahora un solo valor para no distinguir usuario inexistente vs contraseña incorrecta.
 */
export const LOGIN_FAILURE_REASONS = ["invalid_credentials"] as const

export type LoginFailureReason = (typeof LOGIN_FAILURE_REASONS)[number]
