import { getTurnstileSecretKey } from "./turnstile-config.js"

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

type SiteverifyJson = {
  success?: boolean
  "error-codes"?: string[]
}

export type VerifyTurnstileOutcome =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "network" | "invalid" }

/**
 * Valida el token emitido por el widget Turnstile del cliente.
 * `remoteip` es opcional; Cloudflare lo recomienda si está disponible.
 */
export async function verifyTurnstileToken(
  responseToken: string,
  remoteip: string | null,
): Promise<VerifyTurnstileOutcome> {
  const secret = getTurnstileSecretKey()
  if (!secret) return { ok: false, reason: "not_configured" }

  const body = new URLSearchParams()
  body.set("secret", secret)
  body.set("response", responseToken)
  if (remoteip) body.set("remoteip", remoteip)

  let res: Response
  try {
    res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    })
  } catch {
    return { ok: false, reason: "network" }
  }

  let parsed: SiteverifyJson
  try {
    parsed = (await res.json()) as SiteverifyJson
  } catch {
    return { ok: false, reason: "network" }
  }

  if (parsed.success === true) return { ok: true }
  return { ok: false, reason: "invalid" }
}
