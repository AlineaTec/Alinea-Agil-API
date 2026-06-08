import express, { type Express, type NextFunction, type Request, type Response } from "express"
import type { IncomingMessage } from "node:http"

import {
  parsePaddleSignatureHeader,
  paddleWebhookTimestampWithinTolerance,
  verifyPaddleWebhookSignature,
} from "../../../integrations/paddle/paddle-webhook-signature.js"
import type { PaddleBillingWebhookIngestionService } from "../services/paddle-webhook-ingestion.service.js"

/** Express puede exponer el mismo header como `string | string[]`. */
function getIncomingHeaderString(req: IncomingMessage, lowerCaseName: string): string | undefined {
  const v = req.headers[lowerCaseName] as string | string[] | undefined
  if (typeof v === "string") return v
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") return v[0]
  return undefined
}

function contentTypeIsApplicationJson(req: IncomingMessage): boolean {
  const ct = getIncomingHeaderString(req, "content-type")
  if (!ct) return false
  const base = ct.split(";")[0]?.trim().toLowerCase()
  return base === "application/json"
}

export type MountPaddleBillingWebhookRoutesOptions = {
  ingestion: PaddleBillingWebhookIngestionService
  /** Secret del destino de notificaciones Paddle (`endpoint_secret_key`). */
  webhookSecret: string
  /** Anti-replay sobre `ts` del header (segundos). Por defecto env `PADDLE_WEBHOOK_TS_TOLERANCE_SECONDS` o 600. */
  timestampToleranceSeconds?: number
}

/**
 * `POST /v1/integrations/paddle/webhooks`
 *
 * Debe montarse **antes** de `express.json()` global para conservar el body crudo y validar `Paddle-Signature`.
 * No es una ruta de usuario workspace; es ingesta backend Paddle.
 */
export function mountPaddleBillingWebhookRoutes(app: Express, options: MountPaddleBillingWebhookRoutesOptions): void {
  /** `application/json; charset=utf-8` y payloads grandes; el body debe llegar sin tocar para el HMAC. */
  const rawParser = express.raw({
    type: contentTypeIsApplicationJson,
    limit: "1024kb",
  })

  app.post(
    "/v1/integrations/paddle/webhooks",
    rawParser,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const secret = options.webhookSecret.trim()
        if (!secret) {
          res.status(503).json({ error: "webhook_secret_not_configured" })
          return
        }

        const raw = req.body as Buffer
        if (!Buffer.isBuffer(raw)) {
          res.status(500).json({ error: "expected_raw_body" })
          return
        }

        const sigHeader = getIncomingHeaderString(req, "paddle-signature")

        if (!verifyPaddleWebhookSignature(raw, sigHeader, secret)) {
          res.status(400).json({ error: "invalid_signature" })
          return
        }

        const parsedSig = parsePaddleSignatureHeader(sigHeader)
        const tol =
          options.timestampToleranceSeconds ??
          Number(process.env.PADDLE_WEBHOOK_TS_TOLERANCE_SECONDS ?? "600")
        if (
          parsedSig &&
          !paddleWebhookTimestampWithinTolerance(parsedSig.ts, Date.now(), Number.isFinite(tol) ? tol : 600)
        ) {
          res.status(400).json({ error: "stale_timestamp" })
          return
        }

        let json: Record<string, unknown>
        try {
          json = JSON.parse(raw.toString("utf8")) as Record<string, unknown>
        } catch {
          res.status(400).json({ error: "invalid_json" })
          return
        }

        const result = await options.ingestion.handleEnvelope(json, new Date())
        res.status(result.status).json(result.body)
      } catch (err) {
        next(err)
      }
    },
  )
}
