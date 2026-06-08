import type { Request } from "express"

/** Primera IP de `X-Forwarded-For` si existe; si no, `socket.remoteAddress`. */
export function getRequestClientIp(req: Request): string | null {
  const xf = req.headers["x-forwarded-for"]
  if (typeof xf === "string" && xf.length > 0) {
    const first = xf.split(",")[0]?.trim()
    if (first) return first
  }
  const ip = req.socket?.remoteAddress
  return ip ? String(ip) : null
}

export function getRequestUserAgent(req: Request): string | null {
  const h = req.headers["user-agent"]
  return typeof h === "string" && h.trim().length > 0 ? h.trim() : null
}
