import { Router, type NextFunction, type Request, type Response } from "express"

import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import { PlatformTenantForbiddenError } from "../../platform-tenants/domain/platform-tenant.errors.js"
import {
  PaymentReceiptDocumentUnavailableError,
  PaymentReceiptNotFoundError,
  PaymentReceiptRenderError,
} from "../domain/payment-receipt.errors.js"
import type { PaymentReceiptAccessService } from "../services/payment-receipt-access.service.js"
import { decodeCursor } from "../services/payment-receipt-access.service.js"
import {
  platformPaymentReceiptListQuerySchema,
  platformReceiptPublicIdParamsSchema,
} from "../validation/payment-receipt-http.schemas.js"

function sessionOrThrow(res: Response): PlatformSessionContext {
  const s = res.locals.platformSession
  if (!s) {
    throw new Error("platform_session_missing")
  }
  return s
}

export function createPlatformPaymentReceiptsRouter(access: PaymentReceiptAccessService): Router {
  const r = Router()

  r.get("/billing/receipts", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = sessionOrThrow(res)
      access.assertPlatformCanRead(session)
      const q = platformPaymentReceiptListQuerySchema.parse(req.query)
      const cursor = decodeCursor(q.cursor)
      const billingSource = q.billingSource === "all" ? null : q.billingSource
      const out = await access.listForPlatform({
        limit: q.limit,
        cursor,
        workspacePublicId: q.workspacePublicId ?? null,
        billingSource,
        paymentProvider: q.paymentProvider ?? null,
        issuedFrom: q.from ? new Date(q.from) : null,
        issuedTo: q.to ? new Date(q.to) : null,
      })
      res.json({ ok: true, ...out })
    } catch (e) {
      next(e)
    }
  })

  r.get("/billing/receipts/:receiptPublicId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = sessionOrThrow(res)
      access.assertPlatformCanRead(session)
      const { receiptPublicId } = platformReceiptPublicIdParamsSchema.parse(req.params)
      const receipt = await access.getForPlatform(receiptPublicId)
      res.json({ ok: true, receipt })
    } catch (e) {
      next(e)
    }
  })

  r.get("/billing/receipts/:receiptPublicId/download", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = sessionOrThrow(res)
      access.assertPlatformCanRead(session)
      const { receiptPublicId } = platformReceiptPublicIdParamsSchema.parse(req.params)
      const { filename, buffer } = await access.streamPdfForPlatform(receiptPublicId)
      res.setHeader("Content-Type", "application/pdf")
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
      res.status(200).send(buffer)
    } catch (e) {
      next(e)
    }
  })

  r.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof PaymentReceiptNotFoundError) {
      res.status(404).json({ error: err.code, message: err.message })
      return
    }
    if (err instanceof PaymentReceiptDocumentUnavailableError) {
      res.status(409).json({ error: err.code, message: err.message })
      return
    }
    if (err instanceof PaymentReceiptRenderError) {
      res.status(502).json({ error: err.code, message: err.message })
      return
    }
    if (err instanceof PlatformTenantForbiddenError) {
      res.status(403).json({ error: err.code, message: err.message })
      return
    }
    if (err instanceof Error && err.message === "platform_session_missing") {
      res.status(500).json({ error: "internal_error", message: err.message })
      return
    }
    next(err)
  })

  return r
}
