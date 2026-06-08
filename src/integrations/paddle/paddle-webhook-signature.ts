import { createHmac, timingSafeEqual } from "node:crypto"

export type ParsedPaddleSignatureHeader = {
  ts: string
  h1: string
}

/** Extrae `ts` y `h1` del header `Paddle-Signature`: `ts=...;h1=...` */
export function parsePaddleSignatureHeader(header: string | undefined): ParsedPaddleSignatureHeader | null {
  if (!header || typeof header !== "string") return null
  let ts: string | undefined
  let h1: string | undefined
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=")
    if (!k || rest.length === 0) continue
    const v = rest.join("=").trim()
    if (k === "ts") ts = v
    else if (k === "h1") h1 = v
  }
  if (!ts || !h1) return null
  return { ts, h1 }
}

/**
 * Verifica firma HMAC-SHA256 tal como documenta Paddle (`ts` + `:` + raw body).
 * Usar el **buffer crudo** del body sin parsear JSON antes.
 */
export function verifyPaddleWebhookSignature(
  rawBody: Buffer,
  paddleSignatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!secret || secret.trim().length === 0) return false
  const parsed = parsePaddleSignatureHeader(paddleSignatureHeader)
  if (!parsed) return false

  const signedPayload = Buffer.concat([Buffer.from(`${parsed.ts}:`, "utf8"), rawBody])
  const expectedHex = createHmac("sha256", secret).update(signedPayload).digest("hex")

  try {
    const a = Buffer.from(expectedHex, "hex")
    const b = Buffer.from(parsed.h1.trim(), "hex")
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Anti-replay laxo (servidor ↔ Paddle puede haber skew). Por defecto ±10 min.
 */
export function paddleWebhookTimestampWithinTolerance(
  tsSeconds: string,
  nowMs: number,
  toleranceSeconds: number,
): boolean {
  const n = Number(tsSeconds)
  if (!Number.isFinite(n)) return false
  const tsMs = n * 1000
  return Math.abs(nowMs - tsMs) <= toleranceSeconds * 1000
}
