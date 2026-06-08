import type { NextFunction, Request, RequestHandler, Response } from "express"

import { BillingWorkspacePrimaryProductBlockedError } from "../domain/billing-workspace-primary-product.errors.js"
import {
  assertCanUsePrimaryWorkspaceProductFeatures,
  isBillingPrimaryProductMutationExempt,
} from "../domain/billing-workspace-primary-product.policy.js"
import type { WorkspaceBillingStateService } from "../services/workspace-billing-state.service.js"

export function resolveRequestPathWithoutQuery(req: Pick<Request, "originalUrl" | "url">): string {
  const raw = req.originalUrl ?? req.url ?? ""
  return raw.split("?")[0] ?? ""
}

/**
 * Algunas rutas bajo `/v1/me/…` llevan `workspacePublicId` en el JSON (p. ej. `POST /v1/me/product-feedback`),
 * no en `req.params`. El gate de facturación necesita el mismo id que validará el handler.
 */
export function resolveWorkspacePublicIdForBillingMutationGate(req: Request): string | null {
  const fromParams = req.params.workspacePublicId
  if (typeof fromParams === "string" && fromParams.trim().length > 0) {
    return fromParams.trim()
  }
  const rawBody = req.body
  if (typeof rawBody === "object" && rawBody !== null && !Array.isArray(rawBody)) {
    const fromBody = (rawBody as Record<string, unknown>).workspacePublicId
    if (typeof fromBody === "string" && fromBody.trim().length > 0) {
      return fromBody.trim()
    }
  }
  return null
}

/**
 * Middleware: bloquea **mutaciones** HTTP cuando facturación impide uso principal (`suspended_non_payment`,
 * `cancelled`, `expired`). Las lecturas (GET/HEAD/OPTIONS), rutas en `assert…policy` exempt y portal/billing siguen disponibles.
 */
export function createWorkspaceBillingPrimaryProductMutationGate(
  billingStateService: WorkspaceBillingStateService,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const method = req.method.toUpperCase()
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      next()
      return
    }

    const path = resolveRequestPathWithoutQuery(req)
    if (isBillingPrimaryProductMutationExempt(path)) {
      next()
      return
    }

    const workspacePublicId = resolveWorkspacePublicIdForBillingMutationGate(req)
    if (workspacePublicId == null || workspacePublicId.length === 0) {
      next(new Error("workspace_billing_primary_product_gate_missing_workspace_param"))
      return
    }

    try {
      const state = await billingStateService.getBillingState(workspacePublicId)
      assertCanUsePrimaryWorkspaceProductFeatures(state)
      next()
    } catch (err) {
      if (err instanceof BillingWorkspacePrimaryProductBlockedError) {
        res.status(403).json({
          error: err.code,
          message: err.message,
          billingStatus: err.billingStatus,
          billingBlockReason: err.reason,
        })
        return
      }
      next(err)
    }
  }
}
