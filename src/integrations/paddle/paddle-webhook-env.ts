/**
 * Valida que `PADDLE_WEBHOOK_SECRET` no confunda URL de destino con secreto HMAC.
 * La URL del webhook se define solo en Paddle; el env debe ser `endpoint_secret_key`.
 */
export function assertPaddleWebhookSecretEnvNotConfusedWithUrl(): void {
  const raw = process.env.PADDLE_WEBHOOK_SECRET?.trim() ?? ""
  if (raw === "") return
  if (/^https?:\/\//i.test(raw)) {
    throw new Error(
      "PADDLE_WEBHOOK_SECRET no debe ser la URL del webhook. Pon ahí el endpoint_secret_key " +
        "(secreto) del destino de notificaciones en Paddle; la URL https://api…/paddle/webhooks " +
        "solo va configurada en el dashboard de Paddle, no en esta variable.",
    )
  }
}
