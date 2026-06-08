import { getPlatformAdminPublicBaseUrl } from "../config/transactional-email-env.js"
import { BRAND_PRODUCT_LINE, textFooter, wrapTransactionalHtml } from "./layout.js"
import type { RenderedTransactionalEmail } from "./rendered-email.js"

export function renderPlatformUserInvited(params: {
  displayName: string | null
  /** Etiqueta legible del rol (la resuelve el llamador). */
  roleLabel: string
  invitationNonce: string
  invitedEmail: string
}): RenderedTransactionalEmail {
  const name = params.displayName?.trim() || params.invitedEmail
  const roleLabel = params.roleLabel
  const base = getPlatformAdminPublicBaseUrl()
  const steps = base
    ? `<p>1. Abre el panel de administración: <a href="${escapeHtml(base)}" style="color:#18181b;font-weight:600;">${escapeHtml(base)}</a><br>
2. Completa tu contraseña inicial y el enrolamiento MFA (TOTP) con el código que te dará la aplicación.<br>
3. Usa el siguiente <strong>nonce de invitación</strong> cuando el flujo lo solicite (cópialo completo):</p>
<pre style="background:#f4f4f5;padding:12px;border-radius:6px;word-break:break-all;font-size:13px;">${escapeHtml(params.invitationNonce)}</pre>`
    : `<p>1. Abre el panel de administración de plataforma que te indicó quien te invitó.<br>
2. Completa tu contraseña inicial y el enrolamiento MFA (TOTP).<br>
3. Usa el siguiente <strong>nonce de invitación</strong> cuando el flujo lo solicite (cópialo completo):</p>
<pre style="background:#f4f4f5;padding:12px;border-radius:6px;word-break:break-all;font-size:13px;">${escapeHtml(params.invitationNonce)}</pre>`

  const body = `<p>Hola ${escapeHtml(name)},</p>
<p>Has sido invitado a la administración de plataforma de <strong>${BRAND_PRODUCT_LINE}</strong> con el rol: <strong>${escapeHtml(roleLabel)}</strong>.</p>
${steps}
<p><small>Por seguridad, no compartas este correo ni el nonce. Si no esperabas esta invitación, ignora el mensaje.</small></p>`

  const text = [
    `Hola ${name},`,
    ``,
    `Has sido invitado a la administración de plataforma de ${BRAND_PRODUCT_LINE} con el rol: ${roleLabel}.`,
    ``,
    base
      ? `Abre el panel: ${base}`
      : "Abre el panel de administración que te indicó quien te invitó.",
    `Nonce de invitación (úsalo cuando lo pida el flujo):`,
    params.invitationNonce,
    ``,
    "Por seguridad, no compartas este correo. Si no esperabas esta invitación, ignóralo.",
    textFooter(),
  ].join("\n")

  return {
    subject: `Invitación a administración de plataforma — ${BRAND_PRODUCT_LINE}`,
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
