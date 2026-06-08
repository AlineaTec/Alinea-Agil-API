/**
 * Reglas de credenciales en el intento de registro (Fase E, REG-ACCT-*).
 * Alineadas de forma conservadora con el mock `web` (`accountCredentials.ts`)
 * hasta política formal **[P]** en contracts-docs.
 *
 * **MFA (REG-ACCT-04):** no forma parte de esta fase; un flujo real de segundo factor
 * vendrá tras existir módulo de autenticación / decisión de producto (post-activación o paso dedicado **[P]**).
 */
export const REGISTRATION_ACCOUNT_FULL_NAME = {
  minLength: 2,
  maxLength: 200,
} as const

export const REGISTRATION_INTENT_PASSWORD = {
  minLength: 8,
  maxLength: 128,
} as const

/** Normaliza espacios internos; no altera mayúsculas del nombre propio. */
export function normalizeAccountFullName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ")
}

export type AccountCredentialsValidationIssue =
  | "invalid_full_name"
  | "invalid_password"

export function validateAccountFullName(
  normalized: string,
): AccountCredentialsValidationIssue | null {
  if (normalized.length < REGISTRATION_ACCOUNT_FULL_NAME.minLength) {
    return "invalid_full_name"
  }
  if (normalized.length > REGISTRATION_ACCOUNT_FULL_NAME.maxLength) {
    return "invalid_full_name"
  }
  return null
}

/** Contraseña en el transporte; longitud UTF-8 (caracteres, no bytes). */
export function validateIntentPasswordPlain(
  password: string,
): AccountCredentialsValidationIssue | null {
  if (password.length < REGISTRATION_INTENT_PASSWORD.minLength) {
    return "invalid_password"
  }
  if (password.length > REGISTRATION_INTENT_PASSWORD.maxLength) {
    return "invalid_password"
  }
  return null
}
