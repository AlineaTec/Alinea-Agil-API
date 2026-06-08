import { BRAND_PRODUCT_LINE, textFooter, wrapTransactionalHtml } from "./layout.js"
import type { RenderedTransactionalEmail } from "./rendered-email.js"

export function renderRegistrationPaymentConfirmation(params: {
  intentPublicId: string
  workspaceDisplayName?: string
  workspaceCode?: string
  planLabel: string
  billingCadenceLabel: string
}): RenderedTransactionalEmail {
  const ws =
    params.workspaceDisplayName && params.workspaceCode
      ? `${params.workspaceDisplayName} (${params.workspaceCode})`
      : params.workspaceDisplayName || params.workspaceCode || "pendiente de activación"

  const body = `<p>Gracias por completar el pago simulado en <strong>${BRAND_PRODUCT_LINE}</strong>.</p>
<ul style="margin:0;padding-left:20px;">
<li><strong>Workspace:</strong> ${escapeHtml(ws)}</li>
<li><strong>Plan:</strong> ${escapeHtml(params.planLabel)}</li>
<li><strong>Facturación:</strong> ${escapeHtml(params.billingCadenceLabel)}</li>
<li><strong>Referencia de registro:</strong> <code style="font-size:13px;">${escapeHtml(params.intentPublicId)}</code></li>
</ul>
<p>El siguiente paso es <strong>activar</strong> tu espacio de trabajo desde la aplicación si aún no lo has hecho.</p>
<p><small>No incluimos datos bancarios ni comprobantes fiscales en este mensaje.</small></p>`

  const text = [
    `Gracias por completar el pago simulado en ${BRAND_PRODUCT_LINE}.`,
    ``,
    `Workspace: ${ws}`,
    `Plan: ${params.planLabel}`,
    `Facturación: ${params.billingCadenceLabel}`,
    `Referencia de registro: ${params.intentPublicId}`,
    ``,
    "Activa tu workspace desde la aplicación si aún no lo has hecho.",
    textFooter(),
  ].join("\n")

  return {
    subject: `Confirmación de pago del registro — ${BRAND_PRODUCT_LINE}`,
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
