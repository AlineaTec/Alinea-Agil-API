import { BRAND_PRODUCT_LINE, textFooter, wrapTransactionalHtml } from "./layout.js"
import type { RenderedTransactionalEmail } from "./rendered-email.js"

export function renderPlatformAdminSessionStarted(params: {
  greetingName: string
  email: string
  roleLabel: string
  sessionPublicId: string
  sessionStartedAtIso: string
  clientIp: string | null
  userAgentRaw: string | null
  clientSummary: string
}): RenderedTransactionalEmail {
  const name = params.greetingName.trim()
  const ipLine = params.clientIp?.trim() || "No recibida"
  const uaDisplay =
    params.userAgentRaw && params.userAgentRaw.trim().length > 0
      ? params.userAgentRaw.trim().length > 200
        ? `${params.userAgentRaw.trim().slice(0, 197)}…`
        : params.userAgentRaw.trim()
      : "No recibido"

  const body = `<p>Hola ${escapeHtml(name)},</p>
<p>Se ha iniciado sesión en la <strong>administración de plataforma</strong> de <strong>${BRAND_PRODUCT_LINE}</strong> con tu cuenta.</p>
<ul style="margin:0;padding-left:20px;">
<li><strong>Correo:</strong> ${escapeHtml(params.email)}</li>
<li><strong>Rol:</strong> ${escapeHtml(params.roleLabel)}</li>
<li><strong>Fecha y hora (UTC):</strong> ${escapeHtml(params.sessionStartedAtIso)}</li>
<li><strong>IP aproximada:</strong> ${escapeHtml(ipLine)}</li>
<li><strong>Dispositivo / navegador (estimado):</strong> ${escapeHtml(params.clientSummary)}</li>
<li><strong>User-Agent (referencia):</strong> <span style="font-size:12px;word-break:break-all;">${escapeHtml(uaDisplay)}</span></li>
<li><strong>Referencia de sesión:</strong> <code style="font-size:12px;">${escapeHtml(params.sessionPublicId)}</code></li>
</ul>
<p><small>Si <strong>no reconoces</strong> este acceso, contacta a soporte o a un super administrador de plataforma y protege tu cuenta (cambia contraseña y revisa MFA si aplica).</small></p>`

  const text = [
    `Hola ${name},`,
    ``,
    `Nueva sesión en la administración de plataforma de ${BRAND_PRODUCT_LINE}.`,
    ``,
    `Correo: ${params.email}`,
    `Rol: ${params.roleLabel}`,
    `Fecha y hora (UTC): ${params.sessionStartedAtIso}`,
    `IP aproximada: ${ipLine}`,
    `Dispositivo / navegador (estimado): ${params.clientSummary}`,
    `User-Agent: ${uaDisplay}`,
    `Referencia de sesión: ${params.sessionPublicId}`,
    ``,
    "Si no reconoces este acceso, contacta a soporte o a un super administrador y protege tu cuenta.",
    textFooter(),
  ].join("\n")

  return {
    subject: `Nueva sesión en administración de plataforma — ${BRAND_PRODUCT_LINE}`,
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
