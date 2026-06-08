import { paddleRestApiOrigin } from "./paddle-api-base.js"

function coerceRecord(v: unknown): Record<string, unknown> | null {
  if (v === null || v === undefined) return null
  if (typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>
  return null
}

function snippet(text: string, max = 500): string {
  const t = text.trim()
  return t.length <= max ? t : `${t.slice(0, max)}…`
}

export type PaddleSubscriptionFetchFailure = { ok: false; httpStatus: number; bodySnippet: string }

/**
 * GET /subscriptions/:id — respuesta Billing API v2 `{ data: { … } }`.
 * https://developer.paddle.com/api-reference/subscriptions/get-subscription
 */
export async function fetchPaddleSubscriptionData(
  subscriptionId: string,
  apiKey: string,
  origin: string = paddleRestApiOrigin(),
): Promise<{ ok: true; data: Record<string, unknown> } | PaddleSubscriptionFetchFailure> {
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

  if (!res.ok) {
    return { ok: false, httpStatus: res.status, bodySnippet: snippet(text) }
  }

  if (!data) {
    return { ok: false, httpStatus: 502, bodySnippet: snippet(text || "missing data") }
  }

  return { ok: true, data }
}
