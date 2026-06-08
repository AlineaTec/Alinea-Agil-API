import {
  type NextFunction,
  type Request,
  type Response,
  Router,
} from "express"

import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { workspaceUsersAuthMiddlewares } from "../../workspace-users/middleware/workspace-users-auth.middleware.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import {
  assertWorkspaceBillingSeatAuthorized,
  WorkspaceLicensesForbiddenError,
} from "../../billing-seat-enforcement/policies/billing-seat-enforcement-workspace.policy.js"
import {
  PaymentReceiptDocumentUnavailableError,
  PaymentReceiptNotFoundError,
  PaymentReceiptRenderError,
  PaymentReceiptWorkspaceMismatchError,
} from "../domain/payment-receipt.errors.js"
import type { PaymentReceiptAccessService } from "../services/payment-receipt-access.service.js"
import { decodeCursor } from "../services/payment-receipt-access.service.js"
import {
  paymentReceiptPublicIdParamsSchema,
  workspacePaymentReceiptListQuerySchema,
} from "../validation/payment-receipt-http.schemas.js"
import { billingWorkspacePublicIdParamsSchema } from "../../billing-seat-enforcement/validation/workspace-billing-http.schemas.js"

function actor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor as WorkspaceMemberState | undefined
  if (!a) {
    throw new Error("workspace_users_actor_missing")
  }
  return a
}

function workspaceReceiptError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof WorkspaceLicensesForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof PaymentReceiptNotFoundError || err instanceof PaymentReceiptWorkspaceMismatchError) {
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
  if (err instanceof Error && err.message === "workspace_users_actor_missing") {
    res.status(500).json({
      error: "internal_error",
      message: "Actor de workspace no resuelto tras autenticación.",
    })
    return
  }
  next(err)
}

export function createWorkspacePaymentReceiptsRouter(
  access: PaymentReceiptAccessService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))

  router.get("/receipts", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = billingWorkspacePublicIdParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({
          error: "invalid_request",
          message: "workspacePublicId debe ser un UUID.",
          details: params.error.flatten(),
        })
        return
      }
      assertWorkspaceBillingSeatAuthorized({ actor: actor(res), action: "open_customer_portal" })

      const q = workspacePaymentReceiptListQuerySchema.safeParse(req.query)
      if (!q.success) {
        res.status(400).json({
          error: "invalid_request",
          message: "Query inválido.",
          details: q.error.flatten(),
        })
        return
      }
      const cursor = decodeCursor(q.data.cursor)
      const out = await access.listForWorkspace({
        workspacePublicId: params.data.workspacePublicId,
        limit: q.data.limit,
        cursor,
        issuedFrom: q.data.from ? new Date(q.data.from) : null,
        issuedTo: q.data.to ? new Date(q.data.to) : null,
      })
      res.status(200).json({ ok: true, ...out })
    } catch (err) {
      workspaceReceiptError(err, res, next)
    }
  })

  router.get("/receipts/:receiptPublicId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = paymentReceiptPublicIdParamsSchema.safeParse({
        ...req.params,
        workspacePublicId: req.params.workspacePublicId,
      })
      if (!params.success) {
        res.status(400).json({
          error: "invalid_request",
          message: "Parámetros inválidos.",
          details: params.error.flatten(),
        })
        return
      }
      assertWorkspaceBillingSeatAuthorized({ actor: actor(res), action: "open_customer_portal" })
      const detail = await access.getForWorkspace(
        params.data.workspacePublicId,
        params.data.receiptPublicId,
      )
      res.status(200).json({ ok: true, receipt: detail })
    } catch (err) {
      workspaceReceiptError(err, res, next)
    }
  })

  router.get("/receipts/:receiptPublicId/download", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = paymentReceiptPublicIdParamsSchema.safeParse({
        ...req.params,
        workspacePublicId: req.params.workspacePublicId,
      })
      if (!params.success) {
        res.status(400).json({
          error: "invalid_request",
          message: "Parámetros inválidos.",
          details: params.error.flatten(),
        })
        return
      }
      assertWorkspaceBillingSeatAuthorized({ actor: actor(res), action: "open_customer_portal" })
      const { filename, buffer } = await access.streamPdfForWorkspace(
        params.data.workspacePublicId,
        params.data.receiptPublicId,
      )
      res.setHeader("Content-Type", "application/pdf")
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
      res.status(200).send(buffer)
    } catch (err) {
      workspaceReceiptError(err, res, next)
    }
  })

  return router
}
