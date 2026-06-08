import { BRAND_PRODUCT_LINE, textFooter, wrapTransactionalHtml } from "./layout.js"
import type { RenderedTransactionalEmail } from "./rendered-email.js"

export function renderPlatformMfaLockoutNotice(params: {
  lockedUntilIso: string
}): RenderedTransactionalEmail {
  const body = `<p>Se ha bloqueado temporalmente el acceso por múltiples intentos fallidos de MFA (TOTP) en la administración de plataforma de <strong>${BRAND_PRODUCT_LINE}</strong>.</p>
<p><strong>Bloqueo vigente hasta (ISO8601, UTC):</strong> ${escapeHtml(params.lockedUntilIso)}</p>
<p>Si fuiste tú, espera a que venza el bloqueo o contacta a un super administrador de plataforma. <strong>No incluimos enlaces de recuperación automática en este correo.</strong></p>`

  const text = [
    `Aviso de seguridad — ${BRAND_PRODUCT_LINE}`,
    ``,
    `MFA bloqueado temporalmente hasta (UTC aprox.): ${params.lockedUntilIso}`,
    ``,
    "Si fuiste tú, espera o contacta a un super administrador. No hay recuperación automática por este canal.",
    textFooter(),
  ].join("\n")

  return {
    subject: `Bloqueo temporal MFA (plataforma) — ${BRAND_PRODUCT_LINE}`,
    html: wrapTransactionalHtml(body),
    text,
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
