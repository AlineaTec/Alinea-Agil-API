import { BRAND_PRODUCT_LINE, textFooter, wrapTransactionalHtml } from "./layout.js"
import type { RenderedTransactionalEmail } from "./rendered-email.js"

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function renderWorkspaceBillingGraceStarted(params: {
  workspaceDisplayName: string
  workspaceCode: string
  gracePeriodEndsAtLabel: string
  billingHubUrl: string | null
  isPaddleBilling: boolean
}): RenderedTransactionalEmail {
  const hub =
    params.billingHubUrl ??
    "Inicia sesión en la aplicación y abre Facturación desde el menú del workspace."
  const commercial = params.isPaddleBilling
    ? "La renovación recurrente no se completó correctamente. Dispones de un período de gracia para actualizar el método de cobro."
    : "La renovación o el cobro recurrente no se completaron según lo acordado con tu organización. Dispones de un período de gracia para coordinar la regularización por el canal comercial correspondiente."

  const body = `<p><strong>${escapeHtml(params.workspaceDisplayName)}</strong> (${escapeHtml(params.workspaceCode)})</p>
<p>${commercial}</p>
<p><strong>Referencia — fin del período de gracia:</strong> ${escapeHtml(params.gracePeriodEndsAtLabel)}</p>
<p>Durante esta ventana el uso habitual del workspace sigue disponible; conviene regularizar antes de esa fecha para evitar limitaciones posteriores.</p>
<p><strong>Regularizar:</strong> ${escapeHtml(hub)}</p>
<p><small>Este mensaje no incluye datos bancarios ni identificadores internos del procesamiento de cobro.</small></p>`

  const text = [
    `${BRAND_PRODUCT_LINE} — Inicio de período de gracia`,
    ``,
    `Workspace: ${params.workspaceDisplayName} (${params.workspaceCode})`,
    ``,
    commercial,
    ``,
    `Referencia — fin del período de gracia: ${params.gracePeriodEndsAtLabel}`,
    ``,
    "Regularizar:",
    hub,
    textFooter(),
  ].join("\n")

  return {
    subject: `${BRAND_PRODUCT_LINE} — Renovación: período de gracia iniciado (${params.workspaceCode})`,
    html: wrapTransactionalHtml(body),
    text,
  }
}

export function renderWorkspaceBillingSuspensionApproaching(params: {
  workspaceDisplayName: string
  workspaceCode: string
  suspensionExpectedAfterLabel: string
  billingHubUrl: string | null
  isPaddleBilling: boolean
}): RenderedTransactionalEmail {
  const hub = params.billingHubUrl ?? "Inicia sesión y abre Facturación desde el workspace."
  const commercial = params.isPaddleBilling
    ? "Estamos en la recta final del período de gracia. Pasada la fecha indicada, si no se actualiza el cobro recurrente, el uso habitual del workspace puede verse limitado."
    : "Estamos en la recta final del período de gracia. Pasada la fecha indicada, si no se coordina la regularización por el canal acordado, el uso habitual del workspace puede verse limitado."

  const body = `<p><strong>${escapeHtml(params.workspaceDisplayName)}</strong> (${escapeHtml(params.workspaceCode)})</p>
<p>${commercial}</p>
<p><strong>Referencia — umbral del fin de la ventana de gracia:</strong> ${escapeHtml(params.suspensionExpectedAfterLabel)}</p>
<p><strong>Regularizar ahora:</strong> ${escapeHtml(hub)}</p>`

  const text = [
    `${BRAND_PRODUCT_LINE} — Urgencia: fin de gracia próximo`,
    ``,
    `Workspace: ${params.workspaceDisplayName} (${params.workspaceCode})`,
    ``,
    commercial,
    ``,
    `Referencia — umbral del fin de la ventana de gracia: ${params.suspensionExpectedAfterLabel}`,
    ``,
    hub,
    textFooter(),
  ].join("\n")

  return {
    subject: `${BRAND_PRODUCT_LINE} — Acción requerida: fin de gracia (${params.workspaceCode})`,
    html: wrapTransactionalHtml(body),
    text,
  }
}

export function renderWorkspaceBillingSuspended(params: {
  workspaceDisplayName: string
  workspaceCode: string
  billingHubUrl: string | null
  isPaddleBilling: boolean
}): RenderedTransactionalEmail {
  const hub = params.billingHubUrl ?? "Inicia sesión y abre Facturación desde el workspace."
  const commercial = params.isPaddleBilling
    ? "El acceso principal del workspace está limitado: superado el período de gracia sin regularizar el cobro recurrente."
    : "El acceso principal del workspace está limitado: superado el período de gracia sin completar la regularización acordada."

  const body = `<p><strong>${escapeHtml(params.workspaceDisplayName)}</strong> (${escapeHtml(params.workspaceCode)})</p>
<p>${commercial}</p>
<p>Sigue disponible el acceso a Facturación y a las rutas de regularización desde la aplicación para restablecer el uso habitual cuando proceda.</p>
<p><strong>Ir a Facturación / regularizar:</strong> ${escapeHtml(hub)}</p>`

  const text = [
    `${BRAND_PRODUCT_LINE} — Limitación por suscripción`,
    ``,
    `Workspace: ${params.workspaceDisplayName} (${params.workspaceCode})`,
    ``,
    commercial,
    ``,
    "Facturación y regularización siguen disponibles en la aplicación.",
    hub,
    textFooter(),
  ].join("\n")

  return {
    subject: `${BRAND_PRODUCT_LINE} — Suscripción: limitación efectiva (${params.workspaceCode})`,
    html: wrapTransactionalHtml(body),
    text,
  }
}

export function renderWorkspaceBillingRecovered(params: {
  workspaceDisplayName: string
  workspaceCode: string
  billingHubUrl: string | null
}): RenderedTransactionalEmail {
  const hub = params.billingHubUrl ?? "Inicia sesión para continuar."
  const body = `<p><strong>${escapeHtml(params.workspaceDisplayName)}</strong> (${escapeHtml(params.workspaceCode)})</p>
<p>La situación de cobro del workspace figura como regularizada. El uso habitual puede restablecerse conforme a las políticas vigentes.</p>
<p><strong>Abrir la aplicación:</strong> ${escapeHtml(hub)}</p>`

  const text = [
    `${BRAND_PRODUCT_LINE} — Cobro regularizado`,
    ``,
    `Workspace: ${params.workspaceDisplayName} (${params.workspaceCode})`,
    ``,
    "La situación de cobro figura como regularizada. El uso habitual puede restablecerse conforme a las políticas vigentes.",
    hub,
    textFooter(),
  ].join("\n")

  return {
    subject: `${BRAND_PRODUCT_LINE} — Suscripción regularizada (${params.workspaceCode})`,
    html: wrapTransactionalHtml(body),
    text,
  }
}
