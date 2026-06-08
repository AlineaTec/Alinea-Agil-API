import { BRAND_PRODUCT_LINE, textFooter, wrapTransactionalHtml } from "./layout.js"
import type { RenderedTransactionalEmail } from "./rendered-email.js"

export function renderWorkspaceInvitationRevoked(params: {
  displayName: string | null
  invitedEmail: string
  workspaceDisplayName: string
}): RenderedTransactionalEmail {
  const name = params.displayName?.trim() || params.invitedEmail

  const body = `<p>Hola ${escapeHtml(name)},</p>
<p>La invitación pendiente al workspace <strong>${escapeHtml(params.workspaceDisplayName)}</strong> en <strong>${BRAND_PRODUCT_LINE}</strong> ha sido <strong>revocada</strong>. Si aún necesitas acceso, solicita una nueva invitación al administrador.</p>
<p><small>Si no esperabas este mensaje, puedes ignorarlo.</small></p>`

  const text = [
    `Hola ${name},`,
    ``,
    `Se revocó la invitación al workspace "${params.workspaceDisplayName}" en ${BRAND_PRODUCT_LINE}.`,
    ``,
    textFooter(),
  ].join("\n")

  return {
    subject: `Invitación revocada — ${params.workspaceDisplayName} · ${BRAND_PRODUCT_LINE}`,
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
