import { getTransactionalEmailLogoUrl } from "../config/transactional-email-env.js"

/** Línea de producto (informes PDF y correo). */
export const BRAND_PRODUCT_LINE = "Alinea Ágil"
export const BRAND_COMPANY_LINE = "AlineaTec"
/** URL pública del producto (enlaces y pie de correo). */
export const BRAND_PRODUCT_PUBLIC_URL = "https://agil.alineatec.com" as const

/** Tokens de cabecera como en `web/src/modules/reporting/reporting.css` (--report-*). */
const REPORT_HEADER_BG = "#0a0a0a"
const REPORT_HEADER_FG = "#fafafa"
const REPORT_ACCENT = "#c9a227"
const REPORT_PAGE_BG = "#f4f3f0"
const REPORT_SURFACE = "#ffffff"
const REPORT_BORDER = "#e0ddd6"
const REPORT_TEXT_MUTED = "#737373"

function splitSystemNameForWordmark(systemName: string): { primary: string; accent: string | null } {
  const t = systemName.trim()
  const i = t.indexOf(" ")
  if (i === -1) return { primary: t, accent: null }
  return { primary: t.slice(0, i), accent: t.slice(i + 1) }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function transactionalFooterPlain(): string {
  return `Producto de ${BRAND_COMPANY_LINE} · ${BRAND_PRODUCT_PUBLIC_URL}`
}

function transactionalFooterHtml(): string {
  const prefix = `Producto de ${BRAND_COMPANY_LINE}`
  return `${escapeHtml(prefix)} · <a href="${escapeHtml(BRAND_PRODUCT_PUBLIC_URL)}" style="color:${REPORT_TEXT_MUTED};text-decoration:underline;">${escapeHtml(BRAND_PRODUCT_PUBLIC_URL)}</a>`
}

function buildHeaderBrandHtml(logoUrl: string | null): string {
  if (logoUrl) {
    return `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(BRAND_PRODUCT_LINE)}" width="220" style="display:block;height:auto;max-height:44px;width:auto;max-width:220px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;" />`
  }
  const { primary, accent } = splitSystemNameForWordmark(BRAND_PRODUCT_LINE)
  if (!accent) {
    return `<span style="font-size:22px;font-weight:600;color:${REPORT_HEADER_FG};letter-spacing:-0.02em;line-height:1.1;">${escapeHtml(primary)}</span>`
  }
  return `<span style="font-size:22px;font-weight:600;color:${REPORT_HEADER_FG};letter-spacing:-0.02em;line-height:1.1;">${escapeHtml(primary)}</span><span style="font-size:22px;font-weight:600;color:${REPORT_ACCENT};letter-spacing:-0.02em;line-height:1.1;"> ${escapeHtml(accent)}</span>`
}

/**
 * Envuelve el cuerpo con cabecera tipo informe PDF (franja oscura, logo o wordmark) y pie de marca.
 */
export function wrapTransactionalHtml(bodyHtml: string): string {
  const logoUrl = getTransactionalEmailLogoUrl()
  const headerRight = buildHeaderBrandHtml(logoUrl)

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(BRAND_PRODUCT_LINE)}</title>
</head>
<body style="margin:0;padding:0;background:${REPORT_PAGE_BG};font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${REPORT_PAGE_BG};padding:24px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;border-collapse:separate;border-spacing:0;">
        <tr>
          <td style="background:${REPORT_HEADER_BG};color:${REPORT_HEADER_FG};padding:22px 24px 20px;border-radius:8px 8px 0 0;border:1px solid ${REPORT_HEADER_BG};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              <tr>
                <td valign="top" style="padding:0;padding-right:16px;">
                  <div style="font-size:13px;font-weight:600;letter-spacing:0.02em;text-transform:uppercase;color:${REPORT_HEADER_FG};opacity:0.92;line-height:1.3;">${escapeHtml(BRAND_PRODUCT_LINE)}</div>
                  <div style="font-size:12px;font-weight:400;color:${REPORT_HEADER_FG};opacity:0.88;margin-top:6px;line-height:1.45;">Correo transaccional</div>
                </td>
                <td valign="top" align="right" style="padding:0;white-space:nowrap;">${headerRight}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:${REPORT_SURFACE};padding:28px 24px;border:1px solid ${REPORT_BORDER};border-top:0;border-radius:0 0 8px 8px;color:#3f3f46;">
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:18px 8px 0;text-align:center;font-size:11px;line-height:1.5;color:${REPORT_TEXT_MUTED};">
            ${transactionalFooterHtml()}<br />
            <span style="opacity:0.95;">Correo transaccional · no respondas a este mensaje</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}

export function textFooter(): string {
  return `\n\n—\n${BRAND_PRODUCT_LINE}\n${transactionalFooterPlain()}\nCorreo transaccional. No respondas a este mensaje.`
}
