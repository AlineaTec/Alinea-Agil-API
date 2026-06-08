import { BRAND_PRODUCT_LINE, textFooter, wrapTransactionalHtml } from "./layout.js"
import type { RenderedTransactionalEmail } from "./rendered-email.js"

export function renderWorkspaceInvitationAccepted(params: {
  displayName: string | null
  invitedEmail: string
  workspaceDisplayName: string
  workspaceCode: string | null
}): RenderedTransactionalEmail {
  const name = params.displayName?.trim() || params.invitedEmail
  const codeLine =
    params.workspaceCode != null && params.workspaceCode.trim().length > 0
      ? ` · código <strong>${escapeHtml(params.workspaceCode.trim())}</strong>`
      : ""

  const body = `<p>Hola ${escapeHtml(name)},</p>
<p>Ya formas parte del workspace <strong>${escapeHtml(params.workspaceDisplayName)}</strong>${codeLine} en <strong>${BRAND_PRODUCT_LINE}</strong>. Puedes iniciar sesión con tu cuenta habitual.</p>
<p><small>Si no reconoces este cambio, contacta al administrador del workspace.</small></p>`

  const text = [
    `Hola ${name},`,
    ``,
    `Tu acceso al workspace "${params.workspaceDisplayName}" en ${BRAND_PRODUCT_LINE} quedó activo.`,
    ``,
    textFooter(),
  ].join("\n")

  return {
    subject: `Invitación aceptada — ${params.workspaceDisplayName} · ${BRAND_PRODUCT_LINE}`,
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
