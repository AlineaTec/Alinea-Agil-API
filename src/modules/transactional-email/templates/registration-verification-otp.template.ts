import { BRAND_PRODUCT_LINE, textFooter, wrapTransactionalHtml } from "./layout.js"
import type { RenderedTransactionalEmail } from "./rendered-email.js"

export function renderRegistrationVerificationOtp(params: {
  code: string
}): RenderedTransactionalEmail {
  const code = params.code.trim()
  const body = `<p>Tu código de verificación para continuar el registro en <strong>${BRAND_PRODUCT_LINE}</strong> es:</p>
<p style="font-size:22px;font-weight:700;letter-spacing:0.12em;font-family:ui-monospace,monospace;">${escapeHtml(code)}</p>
<p><small>Este código caduca en breve. Si no iniciaste un registro, ignora este mensaje.</small></p>`

  const text = [
    `Tu código de verificación para ${BRAND_PRODUCT_LINE} es: ${code}`,
    ``,
    "El código caduca en breve. Si no iniciaste un registro, ignora este mensaje.",
    textFooter(),
  ].join("\n")

  return {
    subject: `Código de verificación — ${BRAND_PRODUCT_LINE}`,
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
