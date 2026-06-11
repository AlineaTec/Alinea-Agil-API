/** Bloques HTML reutilizables para plantillas transaccionales (tablas inline, clientes de correo). */

const ACCENT = "#c9a227"
const MUTED = "#737373"
const BORDER = "#e0ddd6"
const SURFACE_MUTED = "#f8f7f4"

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function paragraphHtml(text: string): string {
  return `<p style="margin:0 0 16px;line-height:1.55;">${text}</p>`
}

export function sectionHeadingHtml(title: string): string {
  return `<h2 style="margin:24px 0 12px;font-size:16px;font-weight:600;color:#18181b;letter-spacing:-0.01em;">${escapeHtml(title)}</h2>`
}

export function ctaButtonHtml(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 8px;border-collapse:separate;">
  <tr>
    <td style="border-radius:6px;background:${ACCENT};">
      <a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#0a0a0a;text-decoration:none;line-height:1.2;">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`
}

export function orderedStepsHtml(steps: readonly string[]): string {
  const items = steps
    .map((step) => `<li style="margin:0 0 10px;line-height:1.5;">${escapeHtml(step)}</li>`)
    .join("")
  return `<ol style="margin:0 0 16px;padding-left:22px;color:#3f3f46;">${items}</ol>`
}

export function highlightBoxHtml(innerHtml: string): string {
  return `<div style="margin:16px 0 20px;padding:16px 18px;background:${SURFACE_MUTED};border:1px solid ${BORDER};border-radius:6px;line-height:1.5;">${innerHtml}</div>`
}

export function mutedNoteHtml(text: string): string {
  return `<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:${MUTED};">${text}</p>`
}

export function textLinkHtml(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="color:#18181b;font-weight:600;text-decoration:underline;">${escapeHtml(label)}</a>`
}
