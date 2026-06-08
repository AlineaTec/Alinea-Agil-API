/**
 * Remitente único v1 (producto). Sobrescribible por env para staging.
 */
export const DEFAULT_TRANSACTIONAL_EMAIL_FROM = "agil@mail.alineatec.com"

export function getTransactionalEmailFrom(): string {
  return (
    process.env.TRANSACTIONAL_EMAIL_FROM?.trim() || DEFAULT_TRANSACTIONAL_EMAIL_FROM
  )
}

/** Sin envío real; útil en CI / local sin API key. */
export function isTransactionalEmailDisabled(): boolean {
  const v = process.env.TRANSACTIONAL_EMAIL_DISABLED?.trim().toLowerCase()
  return v === "true" || v === "1"
}

export function getResendApiKey(): string | null {
  const k = process.env.RESEND_API_KEY?.trim()
  return k || null
}

/**
 * Normaliza URL pública http(s): exige esquema, elimina `#`/query de uso en correo,
 * y recorta `/` final salvo raíz. Valores inválidos → `null` (mejor omitir enlace que URL rota).
 */
export function normalizePublicHttpUrl(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  try {
    const u = new URL(t)
    if (u.protocol !== "http:" && u.protocol !== "https:") return null
    u.hash = ""
    u.search = ""
    let out = `${u.origin}${u.pathname}`
    if (out.endsWith("/")) {
      out = out.slice(0, -1)
    }
    return out || u.origin
  } catch {
    return null
  }
}

/**
 * URL opcional del admin (solo copy/enlaces en invitaciones).
 * Debe ser absoluta (`https://…`); ver README del módulo.
 */
export function getPlatformAdminPublicBaseUrl(): string | null {
  const u = process.env.PLATFORM_ADMIN_PUBLIC_BASE_URL?.trim()
  if (!u) return null
  return normalizePublicHttpUrl(u)
}

/**
 * URL absoluta del logo claro para cabecera oscura (mismo criterio que PDF en web: `logo-white.png`).
 * Si falta o no es http(s) válida, las plantillas usan marca tipográfica como en informes sin asset.
 */
export function getTransactionalEmailLogoUrl(): string | null {
  const raw = process.env.TRANSACTIONAL_EMAIL_LOGO_URL?.trim()
  if (!raw) return null
  return normalizePublicHttpUrl(raw)
}
