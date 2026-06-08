import { BRAND_PRODUCT_LINE, textFooter, wrapTransactionalHtml } from "./layout.js"
import type { RenderedTransactionalEmail } from "./rendered-email.js"

export function renderPlatformAdminPasswordReset(params: {
  displayName: string | null
  /** URL absoluta HTTPS (incluye `?token=`). */
  resetUrl: string
  invitedEmail: string
}): RenderedTransactionalEmail {
  const name = params.displayName?.trim() || params.invitedEmail
  const link = params.resetUrl

  const body = `<p>Hola ${escapeHtml(name)},</p>
<p>Recibimos una solicitud para restablecer la contraseña de tu cuenta de administración de plataforma en <strong>${BRAND_PRODUCT_LINE}</strong>.</p>
<p><a href="${escapeHtml(link)}" style="color:#18181b;font-weight:600;">Establecer una contraseña nueva</a></p>
<p>Si el enlace no funciona, copia y pega esta dirección en el navegador:</p>
<pre style="background:#f4f4f5;padding:12px;border-radius:6px;word-break:break-all;font-size:12px;">${escapeHtml(link)}</pre>
<p><small>Este enlace caduca en breve. Si no solicitaste el cambio, ignora este mensaje; tu contraseña no se modifica.</small></p>`

  const text = [
    `Hola ${name},`,
    ``,
    `Restablece tu contraseña de administración de ${BRAND_PRODUCT_LINE} abriendo:`,
    link,
    ``,
    "El enlace caduca en poco tiempo. Si no fuiste tú, ignora el correo.",
    textFooter(),
  ].join("\n")

  return {
    subject: `Restablecer contraseña de administración — ${BRAND_PRODUCT_LINE}`,
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
