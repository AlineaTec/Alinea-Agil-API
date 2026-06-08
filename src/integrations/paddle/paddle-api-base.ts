import { getPaymentGatewayConfig } from "../../config/payment-gateway-policy.js"

/**
 * Billing API (servidor): claves clásicas `sandbox_*` / `live_*` y formato unificado
 * `pdl_sdbx_*` (sandbox, p.ej. `pdl_sdbx_apikey_…`) / `pdl_live_*` (producción).
 */
export function paddleServerApiKeyResolvesToLive(key: string): boolean {
  const k = key.trim()
  return k.startsWith("live_") || k.startsWith("pdl_live")
}

export function paddleServerApiKeyResolvesToSandbox(key: string): boolean {
  const k = key.trim()
  return k.startsWith("sandbox_") || k.startsWith("pdl_sdbx")
}

/**
 * Igual que `paddleRestApiOrigin` pero deterministic para tests sin tocar `process.env` global.
 */
export function resolvePaddleRestApiOriginFromEnv(
  env: { PADDLE_API_KEY?: string },
  paymentGatewayMode: "disabled" | "mock" | "sandbox" | "live",
): string {
  const raw = env.PADDLE_API_KEY?.trim()
  if (raw) {
    if (paddleServerApiKeyResolvesToLive(raw)) return "https://api.paddle.com"
    if (paddleServerApiKeyResolvesToSandbox(raw)) return "https://sandbox-api.paddle.com"
  }

  return paymentGatewayMode === "live"
    ? "https://api.paddle.com"
    : "https://sandbox-api.paddle.com"
}

/**
 * Origen Billing API v2. Prioridad: forma de **`PADDLE_API_KEY`** (legado + `pdl_sdbx_*` / `pdl_live_*`)
 * para que una TX sandbox se consulte en `sandbox-api` aunque `PAYMENT_GATEWAY_MODE` sea distinto en el servidor.
 */
export function paddleRestApiOrigin(): string {
  const cfg = getPaymentGatewayConfig()
  return resolvePaddleRestApiOriginFromEnv(process.env, cfg.mode)
}
