import { BRAND_PRODUCT_LINE, textFooter, wrapTransactionalHtml } from "./layout.js"
import type { RenderedTransactionalEmail } from "./rendered-email.js"

export function renderWorkspaceInvitationSent(params: {
  displayName: string | null
  invitedEmail: string
  workspaceDisplayName: string
  workspaceCode: string | null
  roleLabel: string
  acceptUrl: string
}): RenderedTransactionalEmail {
  const name = params.displayName?.trim() || params.invitedEmail
  const codeLine =
    params.workspaceCode != null && params.workspaceCode.trim().length > 0
      ? ` · código <strong>${escapeHtml(params.workspaceCode.trim())}</strong>`
      : ""

  const body = `<p>Hola ${escapeHtml(name)},</p>
<p>Te han invitado al workspace <strong>${escapeHtml(params.workspaceDisplayName)}</strong>${codeLine} en <strong>${BRAND_PRODUCT_LINE}</strong>, con el rol propuesto: <strong>${escapeHtml(params.roleLabel)}</strong>.</p>
<p><a href="${escapeHtml(params.acceptUrl)}" style="color:#18181b;font-weight:600;">Revisar y aceptar invitación</a></p>
<p><small>Este enlace caduca en 7 días. No es un registro comercial de nuevo workspace: solo une tu cuenta a este espacio existente. No enviamos contraseñas por correo.</small></p>`

  const text = [
    `Hola ${name},`,
    ``,
    `Invitación al workspace "${params.workspaceDisplayName}" en ${BRAND_PRODUCT_LINE} con el rol: ${params.roleLabel}.`,
    ``,
    "Aceptar o revisar:",
    params.acceptUrl,
    ``,
    textFooter(),
  ].join("\n")

  return {
    subject: `Invitación a workspace — ${params.workspaceDisplayName} · ${BRAND_PRODUCT_LINE}`,
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
