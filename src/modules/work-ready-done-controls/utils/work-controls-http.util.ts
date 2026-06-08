import type { Request } from "express"

/** Header opcional para consumir token de override emitido vía API de work controls. */
export function getWorkControlOverrideTokenFromRequest(req: Pick<Request, "get">): string | null {
  const h = req.get("X-Work-Controls-Override-Id")
  if (h == null || typeof h !== "string") return null
  const t = h.trim()
  return t.length > 0 ? t : null
}
