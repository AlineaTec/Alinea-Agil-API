/**
 * Credenciales por defecto del seed (solo local/dev).
 * Sobrescribir con SEED_PLATFORM_PASSWORD / SEED_USER_PASSWORD en `.env` si hace falta.
 */

export const SEED_PLATFORM_EMAIL = "agil@alineatec.com"

/** Admin plataforma Alinea Ágil (seed demo). */
export const DEFAULT_SEED_PLATFORM_PASSWORD = "Ag1l!Platf0rm_At3c_9xK#2026"

/** Usuarios workspace en seed demo (owner `pruebas@alineatec.com` y resto del equipo). */
export const DEFAULT_SEED_USER_PASSWORD = "ACME!Prueb4s_At3c_7vQ#2026"

export function resolveSeedPlatformPassword(): string {
  const fromEnv = process.env.SEED_PLATFORM_PASSWORD?.trim()
  return fromEnv && fromEnv.length >= 10 ? fromEnv : DEFAULT_SEED_PLATFORM_PASSWORD
}

export function resolveSeedUserPassword(): string {
  const fromEnv = process.env.SEED_USER_PASSWORD?.trim()
  if (fromEnv && fromEnv.length >= 10) return fromEnv
  return DEFAULT_SEED_USER_PASSWORD
}
