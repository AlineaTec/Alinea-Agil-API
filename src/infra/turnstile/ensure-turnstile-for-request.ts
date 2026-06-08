import type { Request, Response } from "express"
import { isTurnstileVerificationEnabled } from "./turnstile-config.js"
import { verifyTurnstileToken } from "./verify-turnstile-token.js"

function clientIp(req: Request): string | null {
  const xf = req.headers["x-forwarded-for"]
  if (typeof xf === "string" && xf.length > 0) {
    const first = xf.split(",")[0]?.trim()
    if (first) return first
  }
  const ip = req.socket?.remoteAddress
  return ip ? String(ip) : null
}

/**
 * Si Turnstile está activo en servidor, exige token y responde 400 si falta o no verifica.
 * @returns `true` si se puede continuar el handler.
 */
export async function ensureTurnstileForRequest(
  req: Request,
  res: Response,
  turnstileToken: string | undefined,
): Promise<boolean> {
  if (!isTurnstileVerificationEnabled()) return true

  const trimmed = turnstileToken?.trim()
  if (!trimmed) {
    res.status(400).json({
      error: "invalid_request",
      code: "turnstile_required",
      message:
        "Falta la verificación de seguridad. Recarga la página e inténtalo de nuevo.",
    })
    return false
  }

  const outcome = await verifyTurnstileToken(trimmed, clientIp(req))
  if (!outcome.ok) {
    const message =
      outcome.reason === "network"
        ? "No se pudo validar la verificación de seguridad. Inténtalo de nuevo."
        : "La verificación de seguridad no fue válida o caducó. Inténtalo de nuevo."
    res.status(400).json({
      error: "invalid_request",
      code: "turnstile_invalid",
      message,
    })
    return false
  }

  return true
}
