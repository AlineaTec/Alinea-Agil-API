/**
 * Entorno tratado como productivo para políticas de seguridad (Turnstile obligatorio, CORS estricto).
 *
 * - `NODE_ENV=test` → no (ejecución de tests).
 * - `VERCEL=1` → sí (incluye previews en Vercel).
 * - `APP_ENV=production` o `SENTRY_ENVIRONMENT=production` → sí.
 * - `NODE_ENV=production` → sí.
 */
export function isProductionLikeEnvironment(): boolean {
  if (process.env.NODE_ENV?.trim().toLowerCase() === "test") return false
  if (process.env.VERCEL === "1") return true
  const app = process.env.APP_ENV?.trim().toLowerCase()
  if (app === "production") return true
  const se = process.env.SENTRY_ENVIRONMENT?.trim().toLowerCase()
  if (se === "production") return true
  return process.env.NODE_ENV?.trim().toLowerCase() === "production"
}
