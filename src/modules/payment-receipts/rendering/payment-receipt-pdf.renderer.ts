import PDFDocument from "pdfkit"

import type { WorkspacePaymentReceiptProps } from "../domain/workspace-payment-receipt.js"
import { PaymentReceiptRenderError } from "../domain/payment-receipt.errors.js"

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

function planLabel(planKind: string): string {
  const p = planKind.toLowerCase()
  if (p === "individual") return "Individual"
  if (p === "team") return "Equipo (Team)"
  return planKind
}

function cadenceLabel(_c: string | null): string {
  return "Mensual"
}

export async function renderPaymentReceiptPdf(props: WorkspacePaymentReceiptProps): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: "A4" })
      const chunks: Buffer[] = []
      doc.on("data", (c) => chunks.push(c as Buffer))
      doc.on("end", () => resolve(Buffer.concat(chunks)))
      doc.on("error", (e) => reject(e))

      doc.fontSize(18).text("Alinea Ágil", { continued: false })
      doc.moveDown(0.3)
      doc.fontSize(14).text("Recibo de pago", { underline: true })
      doc.moveDown()

      doc.fontSize(10)
      doc.text(`Número: ${props.receiptNumber}`)
      doc.text(`Fecha de emisión: ${props.issuedAt.toISOString().replace("T", " ").slice(0, 16)} UTC`)
      doc.text(`Referencia de pago: ${props.receiptNumber}`)
      doc.moveDown()

      doc.fontSize(11).text("Cliente / Workspace", { underline: true })
      doc.fontSize(10)
      doc.text(`Workspace: ${props.workspaceName}`)
      doc.text(`Titular: ${props.customerName}`)
      if (props.customerEmail) doc.text(`Correo: ${props.customerEmail}`)
      doc.moveDown()

      doc.fontSize(11).text("Plan y asientos (resumen)", { underline: true })
      doc.fontSize(10)
      doc.text(`Modalidad: ${planLabel(props.planKind)}`)
      doc.text(`Asientos incluidos en plan: ${props.includedSeats}`)
      doc.text(`Asientos adicionales contratados: ${props.additionalSeats}`)
      doc.text(`Cadencia: ${cadenceLabel(props.billingCadence)}`)
      if (props.periodStart && props.periodEnd) {
        doc.text(
          `Período cubierto (referencia): ${props.periodStart.toISOString().slice(0, 10)} → ${props.periodEnd.toISOString().slice(0, 10)}`,
        )
      }
      doc.moveDown()

      doc.fontSize(11).text("Importes", { underline: true })
      doc.fontSize(10)
      if (props.subtotalMinor) {
        doc.text(`Subtotal: ${formatMoneyMinor(props.currencyCode, props.subtotalMinor)}`)
      }
      if (props.taxAmountMinor !== null && props.taxAmountMinor !== undefined) {
        doc.text(`Impuestos: ${formatMoneyMinor(props.currencyCode, props.taxAmountMinor)}`)
      }
      doc.fontSize(12).text(`Total pagado: ${formatMoneyMinor(props.currencyCode, props.amountPaidMinor)}`, {
        continued: false,
      })
      doc.moveDown(2)

      doc.fontSize(8).fillColor("#444444")
      doc.text(
        "Este documento confirma la recepción del pago indicado según nuestro proveedor de cobros. " +
          "No sustituye factura fiscal u otro comprobante cuando la normativa aplicable exija un documento distinto.",
        { align: "justify" },
      )
      doc.fillColor("#000000")

      doc.end()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      reject(new PaymentReceiptRenderError(msg))
    }
  })
}
