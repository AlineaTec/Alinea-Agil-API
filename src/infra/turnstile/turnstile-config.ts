import { isProductionLikeEnvironment } from "../../config/production-environment.js"

/**
 * Cloudflare Turnstile: si `TURNSTILE_SECRET_KEY` está definida, las rutas públicas
 * sensibles exigen `turnstileToken` en el cuerpo y lo validan con siteverify.
 *
 * En entorno productivo (`isProductionLikeEnvironment`) la clave es obligatoria: ver
 * `assertTurnstileSecretRequiredInProduction()` al arrancar la app.
 */
export function getTurnstileSecretKey(): string | null {
  const v = process.env.TURNSTILE_SECRET_KEY?.trim()
  return v && v.length > 0 ? v : null
}

export function isTurnstileVerificationEnabled(): boolean {
  return getTurnstileSecretKey() !== null
}

/** Falla en arranque si el despliegue es productivo y falta la clave secreta (fail-closed). */
export function assertTurnstileSecretRequiredInProduction(): void {
  if (!isProductionLikeEnvironment()) return
  if (getTurnstileSecretKey()) return
  throw new Error(
    "TURNSTILE_SECRET_KEY es obligatoria en entorno productivo (p. ej. NODE_ENV=production, APP_ENV=production o VERCEL=1). Sin Turnstile el abuso contra login/registro solo queda limitado por IP.",
  )
}
