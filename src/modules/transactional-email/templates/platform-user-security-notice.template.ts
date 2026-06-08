import { BRAND_PRODUCT_LINE, textFooter, wrapTransactionalHtml } from "./layout.js"
import type { RenderedTransactionalEmail } from "./rendered-email.js"

export type PlatformUserSecurityNoticeKind = "activated" | "deactivated" | "role_changed"

export function renderPlatformUserSecurityNotice(params: {
  kind: PlatformUserSecurityNoticeKind
  /** Nombre visible o correo (sin secretos). */
  greetingName: string
  /** Obligatorio si `kind === "role_changed"`. */
  newRoleLabel?: string
}): RenderedTransactionalEmail {
  const name = params.greetingName.trim()
  let subject: string
  let leadHtml: string
  let leadText: string

  if (params.kind === "role_changed") {
    const role = params.newRoleLabel?.trim() || "—"
    subject = `Cambio de rol en administración de plataforma — ${BRAND_PRODUCT_LINE}`
    leadHtml = `<p>Se ha actualizado tu rol en la administración de plataforma de <strong>${BRAND_PRODUCT_LINE}</strong> a: <strong>${escapeHtml(role)}</strong>.</p>`
    leadText = `Se ha actualizado tu rol en la administración de plataforma de ${BRAND_PRODUCT_LINE} a: ${role}.`
  } else if (params.kind === "deactivated") {
    subject = `Cuenta de administración desactivada — ${BRAND_PRODUCT_LINE}`
    leadHtml = `<p>Tu cuenta de administración de plataforma de <strong>${BRAND_PRODUCT_LINE}</strong> ha sido <strong>desactivada</strong>. No podrás iniciar sesión hasta que un super administrador la reactive.</p>`
    leadText = `Tu cuenta de administración de plataforma de ${BRAND_PRODUCT_LINE} ha sido desactivada. No podrás iniciar sesión hasta que un super administrador la reactive.`
  } else {
    subject = `Cuenta de administración activada — ${BRAND_PRODUCT_LINE}`
    leadHtml = `<p>Tu cuenta de administración de plataforma de <strong>${BRAND_PRODUCT_LINE}</strong> ha sido <strong>activada</strong>. Ya puedes acceder con MFA según las políticas del panel.</p>`
    leadText = `Tu cuenta de administración de plataforma de ${BRAND_PRODUCT_LINE} ha sido activada. Ya puedes acceder con MFA según las políticas del panel.`
  }

  const caution = `<p><small>Si no reconoces este cambio, contacta de inmediato a un super administrador de plataforma.</small></p>`
  const body = `<p>Hola ${escapeHtml(name)},</p>
${leadHtml}
${caution}`

  const text = [
    `Hola ${name},`,
    ``,
    leadText,
    ``,
    "Si no reconoces este cambio, contacta de inmediato a un super administrador de plataforma.",
    textFooter(),
  ].join("\n")

  return {
    subject,
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
