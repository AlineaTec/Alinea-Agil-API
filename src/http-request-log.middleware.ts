import type { NextFunction, Request, Response } from "express"
import { randomUUID } from "node:crypto"
import { useStructuredLogs, writeStructured } from "./logger.js"

function truncateUrl(url: string, max = 512): string {
  if (url.length <= max) return url
  return `${url.slice(0, max - 3)}...`
}

/**
 * Registra cada petición al cerrar la respuesta (una línea JSON en Vercel / LOG_FORMAT=json).
 * Añade `x-request-id` para correlación con el cliente u otros servicios.
 */
export function createHttpRequestLogMiddleware() {
  return function httpRequestLog(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const start = Date.now()
    const vercelIdRaw = req.headers["x-vercel-id"]
    const vercelId = typeof vercelIdRaw === "string" ? vercelIdRaw : undefined
    const incomingRid = req.headers["x-request-id"]
    const requestId =
      (typeof incomingRid === "string" && incomingRid.trim()) ||
      vercelId ||
      randomUUID()

    res.setHeader("x-request-id", requestId)

    res.on("finish", () => {
      const durationMs = Date.now() - start
      const path = truncateUrl(req.originalUrl || req.url || "")
      const forwarded = req.headers["x-forwarded-for"]
      const clientIp =
        typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : undefined
      const userAgentRaw = req.headers["user-agent"]
      const userAgent =
        typeof userAgentRaw === "string"
          ? userAgentRaw.slice(0, 200)
          : undefined

      if (useStructuredLogs()) {
        writeStructured("info", "http.request", {
          method: req.method,
          path,
          statusCode: res.statusCode,
          durationMs,
          requestId,
          ...(vercelId ? { vercelId } : {}),
          ...(clientIp ? { clientIp } : {}),
          ...(userAgent ? { userAgent } : {}),
          ...(process.env.VERCEL_REGION
            ? { vercelRegion: process.env.VERCEL_REGION }
            : {}),
        })
        return
      }

      const vc = vercelId ? ` vercelId=${vercelId.slice(0, 16)}` : ""
      console.log(
        `[http] ${requestId.slice(0, 8)} ${req.method} ${path} → ${res.statusCode} ${durationMs}ms${vc}`,
      )
    })

    next()
  }
}
