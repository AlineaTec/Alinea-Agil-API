/**
 * Extrae importes desde payload Billing API v2 `transaction.*` (conservador).
 * Valores en unidad menor como string entera cuando Paddle las expone así.
 */
export type PaddleTransactionMoneyExtract = {
  currencyCode: string
  amountPaidMinor: string
  subtotalMinor: string | null
  taxAmountMinor: string | null
}

function readString(o: unknown, path: string[]): string | null {
  let cur: unknown = o
  for (const p of path) {
    if (!cur || typeof cur !== "object") return null
    cur = (cur as Record<string, unknown>)[p]
  }
  return typeof cur === "string" ? cur : null
}

function normalizeMinor(raw: string | null): string | null {
  if (!raw) return null
  const t = raw.trim()
  if (!/^\d+$/.test(t)) return null
  return t
}

export function extractPaddleTransactionMoney(data: Record<string, unknown>): PaddleTransactionMoneyExtract | null {
  const currency =
    typeof data.currency_code === "string"
      ? data.currency_code.trim().toUpperCase()
      : typeof (data as { currency?: unknown }).currency === "string"
        ? String((data as { currency: string }).currency).trim().toUpperCase()
        : null
  if (!currency) return null

  const details = data.details && typeof data.details === "object" ? (data.details as Record<string, unknown>) : null
  const totals =
    details?.totals && typeof details.totals === "object"
      ? (details.totals as Record<string, unknown>)
      : data.totals && typeof data.totals === "object"
        ? (data.totals as Record<string, unknown>)
        : null

  const totalRaw =
    totals && typeof totals.total === "string"
      ? totals.total
      : typeof data.totals_total === "string"
        ? data.totals_total
        : readString(data, ["details", "totals", "total"])

  const total = normalizeMinor(totalRaw ?? null)
  if (!total) return null

  const subtotalRaw =
    totals && typeof totals.subtotal === "string"
      ? totals.subtotal
      : readString(data, ["details", "totals", "subtotal"])
  const subtotal = normalizeMinor(subtotalRaw)

  const taxRaw =
    totals && typeof totals.tax === "string"
      ? totals.tax
      : readString(data, ["details", "totals", "tax"])
  const tax = normalizeMinor(taxRaw)
  const taxAmountMinor = tax !== null && tax !== "0" ? tax : tax === "0" ? "0" : null

  return {
    currencyCode: currency,
    amountPaidMinor: total,
    subtotalMinor: subtotal,
    taxAmountMinor,
  }
}

export function extractPaddleTransactionId(data: Record<string, unknown>): string | null {
  const id = data.id
  return typeof id === "string" && id.trim().length > 0 ? id.trim() : null
}

export function extractPaddleCustomerDisplay(data: Record<string, unknown>): { name: string; email: string | null } {
  const directName = typeof data.customer_name === "string" ? data.customer_name.trim() : ""
  const directEmail = typeof data.customer_email === "string" ? data.customer_email.trim().toLowerCase() : null

  const cust =
    data.customer && typeof data.customer === "object" && !Array.isArray(data.customer)
      ? data.customer
      : null
  let name = directName
  let email = directEmail
  if (cust && typeof cust === "object") {
    const c = cust as Record<string, unknown>
    const n =
      typeof c.name === "string"
        ? c.name
        : typeof (c as { email?: unknown }).email === "string"
          ? String((c as { email: string }).email)
          : ""
    if (!name && n) name = n.trim()
    if (!email && typeof c.email === "string") email = c.email.trim().toLowerCase()
  }
  return { name: name || "Cliente", email }
}

/** Intervalo de facturación si Paddle lo expone en ítems (primer ítem). */
export function extractBillingCadenceFromTransactionItems(data: Record<string, unknown>): string | null {
  const details = data.details && typeof data.details === "object" ? (data.details as Record<string, unknown>) : null
  const items = details?.line_items ?? data.line_items
  if (!Array.isArray(items) || items.length < 1) return null
  const first = items[0]
  if (!first || typeof first !== "object") return null
  const interval = (first as Record<string, unknown>).billing_cycle
  if (!interval || typeof interval !== "object") return null
  const intv = (interval as { interval?: unknown }).interval
  if (intv === "month") return "monthly"
  if (intv === "year") return "annual"
  return null
}
