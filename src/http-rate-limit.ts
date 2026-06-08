import type { RequestHandler } from "express"
import rateLimit from "express-rate-limit"

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback
  const n = Number.parseInt(raw.trim(), 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function isRateLimitGloballyDisabled(): boolean {
  const v = process.env.RATE_LIMIT_DISABLED?.trim().toLowerCase()
  return v === "true" || v === "1" || v === "yes"
}

/**
 * `trust proxy` debe estar activo detrás de Vercel/nginx para que los límites usen la IP real.
 * express-rate-limit valida coherencia con `trust proxy` en runtime.
 */
export function applyTrustProxyIfConfigured(app: import("express").Express): void {
  if (process.env.VERCEL === "1" || process.env.TRUST_PROXY?.trim() === "1") {
    app.set("trust proxy", 1)
  }
}

/** POST `/v1/auth/login` — fuerza bruta / relleno de credenciales. */
export function createWorkspaceAuthLoginRateLimiter(): RequestHandler {
  return rateLimit({
    windowMs: parsePositiveInt(process.env.RATE_LIMIT_AUTH_LOGIN_WINDOW_MS, 15 * 60 * 1000),
    limit: parsePositiveInt(process.env.RATE_LIMIT_AUTH_LOGIN_MAX, 5),
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => isRateLimitGloballyDisabled(),
    message: { error: "rate_limit_exceeded", message: "Demasiados intentos de inicio de sesión. Espera unos minutos." },
  })
}

/** POST `/v1/auth/password-reset/*` — abuso por email/token. */
export function createPasswordResetRequestRateLimiter(): RequestHandler {
  return rateLimit({
    windowMs: parsePositiveInt(process.env.RATE_LIMIT_PASSWORD_RESET_REQUEST_WINDOW_MS, 15 * 60 * 1000),
    limit: parsePositiveInt(process.env.RATE_LIMIT_PASSWORD_RESET_REQUEST_MAX, 5),
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => isRateLimitGloballyDisabled(),
    message: {
      error: "rate_limit_exceeded",
      message: "Demasiadas solicitudes de recuperación. Espera unos minutos.",
    },
  })
}

/** POST confirmar token (evitar fuerza bruta). */
export function createPasswordResetConfirmRateLimiter(): RequestHandler {
  return rateLimit({
    windowMs: parsePositiveInt(process.env.RATE_LIMIT_PASSWORD_RESET_CONFIRM_WINDOW_MS, 60 * 60 * 1000),
    limit: parsePositiveInt(process.env.RATE_LIMIT_PASSWORD_RESET_CONFIRM_MAX, 20),
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => isRateLimitGloballyDisabled(),
    message: {
      error: "rate_limit_exceeded",
      message: "Demasiados intentos de restablecimiento. Espera o solicita un enlace nuevo.",
    },
  })
}

/** POST `/v1/platform/auth/login` */
export function createPlatformAuthLoginRateLimiter(): RequestHandler {
  return rateLimit({
    windowMs: parsePositiveInt(process.env.RATE_LIMIT_PLATFORM_LOGIN_WINDOW_MS, 15 * 60 * 1000),
    limit: parsePositiveInt(process.env.RATE_LIMIT_PLATFORM_LOGIN_MAX, 5),
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => isRateLimitGloballyDisabled(),
    message: {
      error: "rate_limit_exceeded",
      message: "Demasiados intentos de acceso al panel de plataforma. Espera unos minutos.",
    },
  })
}

/**
 * Flujo de registro público: elegibilidad, códigos, credenciales, activación y confirmación de pago.
 * Un mismo cubo por IP reduce abuso transversal sin martillar cada paso con políticas distintas.
 */
export function createRegistrationCriticalRateLimiter(): RequestHandler {
  return rateLimit({
    windowMs: parsePositiveInt(process.env.RATE_LIMIT_REGISTRATION_CRITICAL_WINDOW_MS, 60 * 60 * 1000),
    limit: parsePositiveInt(process.env.RATE_LIMIT_REGISTRATION_CRITICAL_MAX, 40),
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => isRateLimitGloballyDisabled(),
    message: {
      error: "rate_limit_exceeded",
      message: "Demasiadas solicitudes de registro desde esta red. Espera antes de continuar.",
    },
  })
}

/** `POST /v1/public/guided-retrospective/resolve-join-by-code` y `.../room-state` — anti-abuso / fuerza bruta de códigos. */
export function createGuidedRetrospectiveJoinResolveRateLimiter(): RequestHandler {
  return rateLimit({
    windowMs: parsePositiveInt(process.env.RATE_LIMIT_GUIDED_RETRO_JOIN_RESOLVE_WINDOW_MS, 60 * 60 * 1000),
    limit: parsePositiveInt(process.env.RATE_LIMIT_GUIDED_RETRO_JOIN_RESOLVE_MAX, 60),
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => isRateLimitGloballyDisabled(),
    message: {
      error: "rate_limit_exceeded",
      message: "Demasiadas verificaciones de código desde esta red. Espera unos minutos.",
    },
  })
}
