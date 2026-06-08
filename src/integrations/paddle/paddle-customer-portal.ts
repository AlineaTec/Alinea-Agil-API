import { paddleRestApiOrigin } from "./paddle-api-base.js"

function coerceRecord(v: unknown): Record<string, unknown> | null {
  if (v === null || v === undefined) return null
  if (typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>
  return null
}

export type PaddleApiErrorFields = {
  code?: string
  detail?: string
  requestId?: string
}

export type PaddleRemoteFailure = {
  ok: false
  httpStatus: number
  bodySnippet: string
  paddleApiError?: PaddleApiErrorFields
}

function snippet(text: string, max = 500): string {
  const t = text.trim()
  return t.length <= max ? t : `${t.slice(0, max)}…`
}

function extractPaddleApiErrorFields(json: unknown): PaddleApiErrorFields {
  const root = coerceRecord(json)
  const err = coerceRecord(root?.error)
  const meta = coerceRecord(root?.meta)
  const code = err && typeof err.code === "string" ? err.code : undefined
  const detail = err && typeof err.detail === "string" ? err.detail : undefined
  const requestId = meta && typeof meta.request_id === "string" ? meta.request_id : undefined
  return { code, detail, requestId }
}

function withRemoteFailure(
  httpStatus: number,
  text: string,
  json: unknown,
): PaddleRemoteFailure {
  const paddleApiError = extractPaddleApiErrorFields(json)
  const has = paddleApiError.code ?? paddleApiError.requestId ?? paddleApiError.detail
  return {
    ok: false,
    httpStatus,
    bodySnippet: snippet(text),
    ...(has ? { paddleApiError } : {}),
  }
}

/**
 * Paddle Billing devolvió primero `urls.general` como string; la API actual usa
 * `urls.general.overview`. Ver documentación "Use customer portal links in your app".
 */
function resolveCustomerPortalUrlFromSessionData(
  data: Record<string, unknown> | null,
  subscriptionIds: string[] | undefined,
): string | null {
  const urls = data ? coerceRecord(data.urls) : null
  if (!urls) return null

  const gen = urls.general
  if (typeof gen === "string" && gen.length >= 8) {
    return gen
  }
  const genObj = coerceRecord(gen)
  const overview = genObj && typeof genObj.overview === "string" ? genObj.overview : null
  if (overview && overview.length >= 8) {
    return overview
  }

  const wantSub = subscriptionIds?.find((s) => s.trim().length > 0)?.trim()
  const subsRaw = urls.subscriptions
  if (wantSub && Array.isArray(subsRaw)) {
    for (const item of subsRaw) {
      const row = coerceRecord(item)
      if (!row || row.id !== wantSub) continue
      const pay = row.update_subscription_payment_method
      if (typeof pay === "string" && pay.length >= 8) return pay
      const cancel = row.cancel_subscription
      if (typeof cancel === "string" && cancel.length >= 8) return cancel
    }
  }

  return null
}

/**
 * GET /subscriptions/:id → `data.customer_id`
 * https://developer.paddle.com/api-reference/subscriptions/get-subscription
 */
export async function fetchPaddleSubscriptionCustomerId(
  subscriptionId: string,
  apiKey: string,
  origin: string = paddleRestApiOrigin(),
): Promise<{ ok: true; customerId: string } | PaddleRemoteFailure> {
  const url = `${origin}/subscriptions/${encodeURIComponent(subscriptionId)}`
  let res: Response
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
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
  const customerId = data && typeof data.customer_id === "string" ? data.customer_id : null

  if (!res.ok) {
    return withRemoteFailure(res.status, text, json)
  }

  if (!customerId) {
    return { ok: false, httpStatus: 502, bodySnippet: snippet(text || "missing customer_id") }
  }

  return { ok: true, customerId }
}

/**
 * POST /customers/:customer_id/portal-sessions
 * https://developer.paddle.com/api-reference/customer-portals/create-customer-portal-session
 */
export async function createPaddleCustomerPortalSession(
  customerId: string,
  apiKey: string,
  options: {
    origin?: string
    subscriptionIds?: string[]
  } = {},
): Promise<{ ok: true; portalUrl: string } | PaddleRemoteFailure> {
  const origin = options.origin ?? paddleRestApiOrigin()
  const url = `${origin}/customers/${encodeURIComponent(customerId)}/portal-sessions`
  const body =
    options.subscriptionIds && options.subscriptionIds.length > 0
      ? JSON.stringify({ subscription_ids: options.subscriptionIds })
      : JSON.stringify({})

  let res: Response
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body,
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
    return withRemoteFailure(res.status, text, json)
  }

  const portalUrl = resolveCustomerPortalUrlFromSessionData(data, options.subscriptionIds)
  if (!portalUrl) {
    return { ok: false, httpStatus: 502, bodySnippet: snippet(text || "missing portal url in session") }
  }

  return { ok: true, portalUrl }
}
