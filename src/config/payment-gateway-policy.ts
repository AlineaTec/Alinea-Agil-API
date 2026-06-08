/**
 * Política alineada con `web` (`VITE_APP_ENV`, `VITE_PAYMENT_GATEWAY_*`): controla si el API
 * acepta mutaciones del flujo público de registro comercial.
 *
 * Variables (sin prefijo VITE):
 * - APP_ENV — development | demo | production
 * - PAYMENT_GATEWAY_PROVIDER — paddle
 * - PAYMENT_GATEWAY_MODE — disabled | mock | sandbox | live
 * - PAYMENT_GATEWAY_STATUS — inactive | pending_approval | active | paused
 */
import type { NextFunction, Request, Response } from "express"

export type AppEnv = "development" | "demo" | "production"

export type PaymentGatewayProvider = "paddle"

export type PaymentGatewayMode = "disabled" | "mock" | "sandbox" | "live"

export type PaymentGatewayStatus =
  | "inactive"
  | "pending_approval"
  | "active"
  | "paused"

export type CommercialRegistrationBlockCode =
  | "pending_approval"
  | "paused"
  | "inactive"
  | "checkout_unavailable"

const APP_ENVS: AppEnv[] = ["development", "demo", "production"]
const PROVIDERS: PaymentGatewayProvider[] = ["paddle"]
const MODES: PaymentGatewayMode[] = ["disabled", "mock", "sandbox", "live"]
const STATUSES: PaymentGatewayStatus[] = [
  "inactive",
  "pending_approval",
  "active",
  "paused",
]

function pick<T extends string>(raw: string | undefined, allowed: readonly T[], fallback: T): T {
  const v = raw?.trim().toLowerCase()
  return (allowed as readonly string[]).includes(v ?? "") ? (v as T) : fallback
}

export type PaymentGatewayConfig = {
  env: AppEnv
  provider: PaymentGatewayProvider
  mode: PaymentGatewayMode
  status: PaymentGatewayStatus
}

export function getPaymentGatewayConfig(): PaymentGatewayConfig {
  return {
    env: pick(process.env.APP_ENV, APP_ENVS, "development"),
    provider: pick(process.env.PAYMENT_GATEWAY_PROVIDER, PROVIDERS, "paddle"),
    mode: pick(process.env.PAYMENT_GATEWAY_MODE, MODES, "disabled"),
    status: pick(process.env.PAYMENT_GATEWAY_STATUS, STATUSES, "inactive"),
  }
}

/** Misma regla que `canProceedToCommercialPaymentStep` en `web` (parametrizable para tests). */
export function isCommercialRegistrationAllowedForConfig(cfg: PaymentGatewayConfig): boolean {
  if (cfg.env === "development" || cfg.env === "demo") return true
  if (cfg.mode === "mock" || cfg.mode === "disabled") return true
  return (cfg.mode === "live" || cfg.mode === "sandbox") && cfg.status === "active"
}

export function isCommercialRegistrationApiAllowed(): boolean {
  return isCommercialRegistrationAllowedForConfig(getPaymentGatewayConfig())
}

function resolveBlockCode(cfg: PaymentGatewayConfig): CommercialRegistrationBlockCode {
  if (cfg.env !== "production") return "checkout_unavailable"
  if (cfg.status === "pending_approval") return "pending_approval"
  if (cfg.status === "paused") return "paused"
  if (cfg.status === "inactive") return "inactive"
  return "checkout_unavailable"
}

function blockMessage(code: CommercialRegistrationBlockCode): string {
  switch (code) {
    case "pending_approval":
      return "El registro comercial está temporalmente en pausa mientras activamos pagos."
    case "paused":
      return "El registro comercial no está disponible en este momento (mantenimiento o pausa operativa)."
    case "inactive":
      return "El registro comercial no está activo en este entorno."
    default:
      return "El alta de nuevas suscripciones no está habilitada en este entorno."
  }
}

export type CommercialRegistrationBlockedBody = {
  error: "commercial_registration_blocked"
  code: CommercialRegistrationBlockCode
  message: string
}

export function getCommercialRegistrationBlockedPayload(): CommercialRegistrationBlockedBody {
  const cfg = getPaymentGatewayConfig()
  const code = resolveBlockCode(cfg)
  return {
    error: "commercial_registration_blocked",
    code,
    message: blockMessage(code),
  }
}

/** Si el registro está bloqueado, envía 403 y devuelve true. */
export function respondIfCommercialRegistrationBlocked(res: Response): boolean {
  if (isCommercialRegistrationApiAllowed()) return false
  res.status(403).json(getCommercialRegistrationBlockedPayload())
  return true
}

/** Middleware Express: 403 cuando el flujo de registro comercial no está permitido. */
export function commercialRegistrationApiGate(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (respondIfCommercialRegistrationBlocked(res)) return
  next()
}
