import { BRAND_PRODUCT_LINE, textFooter, wrapTransactionalHtml } from "./layout.js"
import type { RenderedTransactionalEmail } from "./rendered-email.js"

export function renderWorkspaceMemberAdded(params: {
  displayName: string | null
  invitedEmail: string
  workspaceDisplayName: string
  workspaceCode: string | null
  roleLabel: string
  loginUrl: string
  registerUrl: string
  hasRegisteredAccount: boolean
}): RenderedTransactionalEmail {
  const name = params.displayName?.trim() || params.invitedEmail
  const codeLine =
    params.workspaceCode != null && params.workspaceCode.trim().length > 0
      ? ` · código <strong>${escapeHtml(params.workspaceCode.trim())}</strong>`
      : ""

  const accessBlock = params.hasRegisteredAccount
    ? `<p>Ya tienes una cuenta en <strong>${BRAND_PRODUCT_LINE}</strong> con este correo. Para entrar al workspace:</p>
<p><a href="${escapeHtml(params.loginUrl)}" style="color:#18181b;font-weight:600;">Iniciar sesión</a></p>
<p><small>Usa la contraseña que definiste al registrarte. Si no la recuerdas, desde la pantalla de acceso puedes solicitar restablecerla.</small></p>`
    : `<p>Aún no consta una cuenta de producto con este correo. Para unirte al workspace necesitas completar el registro usando <strong>exactamente</strong> la dirección ${escapeHtml(params.invitedEmail)}:</p>
<p><a href="${escapeHtml(params.registerUrl)}" style="color:#18181b;font-weight:600;">Crear mi cuenta</a></p>
<p>Después podrás <a href="${escapeHtml(params.loginUrl)}" style="color:#18181b;font-weight:600;">iniciar sesión</a> con el correo y la contraseña que elijas.</p>`

  const body = `<p>Hola ${escapeHtml(name)},</p>
<p>Te han añadido al workspace <strong>${escapeHtml(params.workspaceDisplayName)}</strong>${codeLine} en <strong>${BRAND_PRODUCT_LINE}</strong>, con el rol: <strong>${escapeHtml(params.roleLabel)}</strong>.</p>
${accessBlock}
<p><small>Por seguridad, no enviamos contraseñas por correo. Si no esperabas este mensaje, puedes ignorarlo o contactar al administrador del workspace.</small></p>`

  const accessText = params.hasRegisteredAccount
    ? [
        "Como ya tienes cuenta, entra en:",
        params.loginUrl,
        "",
        "Usa tu contraseña habitual; si la olvidaste, solicita restablecerla desde el acceso.",
      ]
    : [
        "Aún no hay cuenta con este correo. Regístrate (mismo email) en:",
        params.registerUrl,
        "",
        "Luego inicia sesión en:",
        params.loginUrl,
      ]

  const text = [
    `Hola ${name},`,
    ``,
    `Te añadieron al workspace "${params.workspaceDisplayName}" en ${BRAND_PRODUCT_LINE} con el rol: ${params.roleLabel}.`,
    ``,
    ...accessText,
    ``,
    "No enviamos contraseñas por correo.",
    textFooter(),
  ].join("\n")

  return {
    subject: `Acceso al workspace — ${params.workspaceDisplayName} · ${BRAND_PRODUCT_LINE}`,
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
