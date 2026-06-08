import { paddleRestApiOrigin } from "./paddle-api-base.js"

function coerceRecord(v: unknown): Record<string, unknown> | null {
  if (v === null || v === undefined) return null
  if (typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>
  return null
}

function snippet(text: string, max = 800): string {
  const t = text.trim()
  return t.length <= max ? t : `${t.slice(0, max)}…`
}

export type PaddleRestFailure = { ok: false; httpStatus: number; bodySnippet: string }

export type PaddleRestSuccess = { ok: true; data: Record<string, unknown> }

async function paddleJsonRequest(options: {
  method: "GET" | "POST" | "PATCH"
  path: string
  apiKey: string
  origin?: string
  body?: unknown
}): Promise<PaddleRestSuccess | PaddleRestFailure> {
  const origin = options.origin ?? paddleRestApiOrigin()
  const url = `${origin}${options.path.startsWith("/") ? "" : "/"}${options.path}`
  let res: Response
  try {
    res = await fetch(url, {
      method: options.method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, httpStatus: 502, bodySnippet: msg }
  }

  const text = await res.text()
  let json: unknown
  try {
    json = JSON.parse(text) as unknown
  } catch {
    return { ok: false, httpStatus: res.ok ? 502 : res.status, bodySnippet: snippet(text) }
  }

  const root = coerceRecord(json)
  const data = coerceRecord(root?.data)

  if (!res.ok) {
    return { ok: false, httpStatus: res.status, bodySnippet: snippet(text) }
  }

  if (!data) {
    return { ok: false, httpStatus: 502, bodySnippet: snippet(text || "missing data") }
  }

  return { ok: true, data }
}

/**
 * POST /transactions — alta de suscripción vía checkout (draft si faltan customer/address).
 * https://developer.paddle.com/api-reference/transactions/create-transaction
 */
export async function createPaddleTransaction(
  apiKey: string,
  body: Record<string, unknown>,
  options: { origin?: string } = {},
): Promise<PaddleRestSuccess | PaddleRestFailure> {
  return paddleJsonRequest({
    method: "POST",
    path: "/transactions",
    apiKey,
    origin: options.origin,
    body,
  })
}

/**
 * PATCH /subscriptions/:id
 * https://developer.paddle.com/api-reference/subscriptions/update-subscription
 */
export async function patchPaddleSubscription(
  subscriptionId: string,
  apiKey: string,
  body: Record<string, unknown>,
  options: { origin?: string } = {},
): Promise<PaddleRestSuccess | PaddleRestFailure> {
  return paddleJsonRequest({
    method: "PATCH",
    path: `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    apiKey,
    origin: options.origin,
    body,
  })
}

/**
 * PATCH /subscriptions/:id/preview
 * https://developer.paddle.com/api-reference/subscriptions/preview-subscription
 */
export async function previewPaddleSubscriptionPatch(
  subscriptionId: string,
  apiKey: string,
  body: Record<string, unknown>,
  options: { origin?: string } = {},
): Promise<PaddleRestSuccess | PaddleRestFailure> {
  return paddleJsonRequest({
    method: "PATCH",
    path: `/subscriptions/${encodeURIComponent(subscriptionId)}/preview`,
    apiKey,
    origin: options.origin,
    body,
  })
}

export function extractTransactionCheckoutUrl(data: Record<string, unknown>): string | null {
  const checkout = coerceRecord(data.checkout)
  const url = checkout && typeof checkout.url === "string" ? checkout.url.trim() : ""
  return url.length > 8 ? url : null
}

export function extractTransactionId(data: Record<string, unknown>): string | null {
  const id = data.id
  return typeof id === "string" && id.startsWith("txn_") ? id : null
}
