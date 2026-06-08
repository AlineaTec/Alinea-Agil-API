import type { RenderedTransactionalEmail } from "./rendered-email.js"

function formatMoneyMinor(currencyCode: string, minorUnits: string): string {
  const n = Number.parseInt(minorUnits, 10)
  if (!Number.isFinite(n)) return `${minorUnits} ${currencyCode}`
  const major = n / 100
  try {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: currencyCode }).format(major)
  } catch {
    return `${major.toFixed(2)} ${currencyCode}`
  }
}

export function renderWorkspacePaymentReceipt(params: {
  receiptNumber: string
  workspaceDisplayName: string
  amountPaidMinor: string
  currencyCode: string
  billingHubUrl: string | null
}): RenderedTransactionalEmail {
  const total = formatMoneyMinor(params.currencyCode, params.amountPaidMinor)
  const hub = params.billingHubUrl
  const subject = `Recibo de pago ${params.receiptNumber} — Alinea Ágil`
  const textLines = [
    "Hola,",
    "",
    `Tu pago quedó registrado. Recibo: ${params.receiptNumber}.`,
    `Workspace: ${params.workspaceDisplayName}.`,
    `Importe: ${total}.`,
    "",
    hub
      ? `Puedes consultar tus recibos y facturación en: ${hub}`
      : "Inicia sesión en Alinea Ágil y abre Facturación para ver tus recibos.",
    "",
    "Este mensaje no incluye adjuntos por seguridad. El PDF está disponible en la aplicación (descarga autenticada).",
    "",
    "— Alinea Ágil",
  ]
  const html = `
  <p>Hola,</p>
  <p>Tu pago quedó registrado.</p>
  <ul>
    <li><strong>Recibo:</strong> ${escapeHtml(params.receiptNumber)}</li>
    <li><strong>Workspace:</strong> ${escapeHtml(params.workspaceDisplayName)}</li>
    <li><strong>Importe:</strong> ${escapeHtml(total)}</li>
  </ul>
  ${
    hub
      ? `<p><a href="${escapeAttr(hub)}">Abrir Facturación / recibos</a></p>`
      : "<p>Inicia sesión en Alinea Ágil y abre Facturación para ver tus recibos.</p>"
  }
  <p style="font-size:12px;color:#555;">Este mensaje no incluye adjuntos por seguridad. El PDF está disponible en la aplicación (descarga autenticada).</p>
  <p>— Alinea Ágil</p>
  `.trim()

  return { subject, html, text: textLines.join("\n") }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;")
}
