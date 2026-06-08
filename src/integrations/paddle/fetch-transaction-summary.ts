import { paddleRestApiOrigin } from "./paddle-api-base.js"

export type PaddlePaymentAuditSnapshot = {
  transactionId: string
  paddleStatus?: string | null
  /** Intento de cobro más reciente (orden Paddle: primero = más reciente). */
  paymentAttemptStatus?: string | null
  card?: {
    cardholderName?: string
    brand?: string
    firstSix?: string
    lastFour?: string
    expiryMonth?: number
    expiryYear?: number
  }
  /** ISO al leer la TX en el API (trazabilidad; no incluye datos de tarjeta PAN/CVV). */
  confirmedAtIso: string
}

export type PaddleTransactionSummary = {
  id: string
  status?: string | null
  customDataIntentPublicId?: string | null
  /** Suscripción Billing (`sub_*`) cuando la transacción está ligada a una suscripción. */
  subscriptionId?: string | null
  audit?: PaddlePaymentAuditSnapshot
}

type LooseRecord = Record<string, unknown>

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Estados que Paddle considera cobrados (Billing). */
const PAIDISH = new Set([
  "completed",
  "completed_with_balance",
  "paid",
  "billed",
  "ready",
])

/** No reintentar indefinidamente si la TX ya es un estado terminal de fallo concreto. */
const TERMINAL_UNPAID = new Set(["past_due", "canceled", "cancelled"])

function coerceRecord(v: unknown): LooseRecord | null {
  if (v === null || v === undefined) return null
  if (typeof v === "object" && !Array.isArray(v)) return v as LooseRecord
  return null
}

function intentPublicIdFromCustomData(raw: unknown): string | null {
  let obj = coerceRecord(raw)
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown
      obj = coerceRecord(parsed)
    } catch {
      return null
    }
  }
  if (!obj) return null
  const cand =
    obj.intent_public_id ??
    obj["intent-public-id"] ??
    obj.intentPublicId ??
    obj.intent_publicId
  return typeof cand === "string" && cand.length > 0 ? cand : null
}

function pickString(r: LooseRecord | null, ...keys: string[]): string | undefined {
  if (!r) return undefined
  for (const k of keys) {
    const x = r[k]
    if (typeof x === "string" && x.length > 0) return x
  }
  return undefined
}

function pickNumber(r: LooseRecord | null, ...keys: string[]): number | undefined {
  if (!r) return undefined
  for (const k of keys) {
    const x = r[k]
    if (typeof x === "number" && Number.isFinite(x)) return x
    if (typeof x === "string" && /^[0-9]+$/.test(x)) return Number.parseInt(x, 10)
  }
  return undefined
}

function subscriptionIdFromTransactionData(data: LooseRecord): string | null {
  const sid = data.subscription_id
  if (typeof sid === "string" && sid.trim() !== "") return sid.trim()
  const ids = data.subscription_ids
  if (Array.isArray(ids) && ids.length > 0 && typeof ids[0] === "string" && ids[0].trim() !== "") {
    return ids[0].trim()
  }
  return null
}

function snapshotFromTransactionJson(
  data: LooseRecord,
  transactionId: string,
  confirmedAtIso: string,
): PaddlePaymentAuditSnapshot {
  const payments = Array.isArray(data.payments) ? data.payments : []
  const first = coerceRecord(payments[0])

  const md = coerceRecord(first?.method_details)
  /** Card típico: method_details.card (Billing). */
  const cardNestedRaw = coerceRecord(md?.card) ?? coerceRecord(md)
  let cardNested = cardNestedRaw
  const tpe = md?.type
  if (cardNested && typeof tpe === "string" && tpe !== "card") {
    cardNested = null
  }

  const card =
    cardNested && Object.keys(cardNested).length > 0
      ? {
          cardholderName: pickString(cardNested, "cardholder_name"),
          brand: pickString(cardNested, "card_brand", "type", "card_type"),
          firstSix: pickString(cardNested, "first_six", "firstSix"),
          lastFour: pickString(cardNested, "last_four", "lastFour"),
          expiryMonth: pickNumber(cardNested, "expiry_month"),
          expiryYear: pickNumber(cardNested, "expiry_year"),
        }
      : undefined

  return {
    transactionId,
    paddleStatus: typeof data.status === "string" ? data.status : undefined,
    paymentAttemptStatus:
      typeof first?.status === "string" ? String(first.status) : undefined,
    card,
    confirmedAtIso,
  }
}

/**
 * Obtiene estado de cobro desde la API REST de Paddle (Billing API v2).
 * Requiere `PADDLE_API_KEY` (servidor). Incluye reintentos breves mientras la TX pasa a estado de cobro.
 */
export async function fetchPaddleTransactionSummary(
  transactionId: string,
): Promise<{ ok: true; summary: PaddleTransactionSummary } | { ok: false; httpStatus: number; bodySnippet: string }> {
  const key = process.env.PADDLE_API_KEY?.trim()
  if (!key) {
    return {
      ok: false,
      httpStatus: 500,
      bodySnippet: "PADDLE_API_KEY no configurado en el servidor",
    }
  }

  const maxAttempts = 12
  const delayMs = 400
  let lastOkUnpaid: { ok: true; summary: PaddleTransactionSummary } | null = null

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const once = await fetchPaddleTransactionOnce(transactionId, key)
    if (!once.ok) {
      const retriable =
        once.httpStatus === 429 ||
        once.httpStatus === 404 ||
        once.httpStatus >= 500
      if (attempt < maxAttempts - 1 && retriable) {
        await sleep(delayMs)
        continue
      }
      return once
    }

    if (transactionLooksPaid(once.summary)) return once

    lastOkUnpaid = once

    const st = (once.summary.status ?? "").toLowerCase()
    if (TERMINAL_UNPAID.has(st)) return once

    await sleep(delayMs)
  }

  return lastOkUnpaid ?? { ok: false, httpStatus: 504, bodySnippet: "sin respuesta coherente de Paddle tras reintentos" }
}

async function fetchPaddleTransactionOnce(
  transactionId: string,
  key: string,
): Promise<
  | { ok: true; summary: PaddleTransactionSummary }
  | { ok: false; httpStatus: number; bodySnippet: string }
> {
  const origin = paddleRestApiOrigin()
  const url = `${origin}/transactions/${encodeURIComponent(transactionId)}`
  const confirmedAtIso = new Date().toISOString()

  let res: Response
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${key}`,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, httpStatus: 502, bodySnippet: msg }
  }

  const text = await res.text()
  let json: { data?: unknown } | null = null
  try {
    json = JSON.parse(text) as { data?: unknown }
  } catch {
    /* ignore */
  }

  const data = coerceRecord(json?.data)
  const id = typeof data?.id === "string" ? data.id : transactionId

  const customIntentId = intentPublicIdFromCustomData(data?.custom_data)

  if (!res.ok) {
    return {
      ok: false,
      httpStatus: res.status,
      bodySnippet: text.slice(0, 500),
    }
  }

  if (!data) {
    return {
      ok: false,
      httpStatus: 502,
      bodySnippet: text.slice(0, 400),
    }
  }

  const audit = snapshotFromTransactionJson(data, id, confirmedAtIso)
  const subscriptionId = subscriptionIdFromTransactionData(data)

  return {
    ok: true,
    summary: {
      id,
      status: typeof data.status === "string" ? data.status : null,
      customDataIntentPublicId: customIntentId,
      subscriptionId,
      audit,
    },
  }
}

export function transactionLooksPaid(summary: PaddleTransactionSummary): boolean {
  const s = (summary.status ?? "").toLowerCase()
  if (PAIDISH.has(s)) return true

  /** Intento más reciente con cobro efectivo aunque el estado superior aún no figure como `completed`. */
  const paySt = summary.audit?.paymentAttemptStatus?.toLowerCase() ?? ""
  if (paySt === "captured") return true

  return false
}
