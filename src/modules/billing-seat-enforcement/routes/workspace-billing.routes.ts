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
  WORKSPACE_AUDIT_GOVERNANCE_SENTINEL_PROJECT_PUBLIC_ID,
} from "../../workspace-audit-log/domain/workspace-audit-log-entry.js"
import type { WorkspaceAuditLogRepository } from "../../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import { WorkspaceBillingInvariantError } from "../domain/billing-seat-enforcement.errors.js"
import {
  WorkspaceBillingPortalManualBillingError,
  WorkspaceBillingPortalMissingLinkError,
  WorkspaceBillingPortalPaddleUnavailableError,
} from "../domain/billing-portal.errors.js"
import { WorkspaceCommercialSubscriptionError } from "../domain/workspace-commercial-subscription.errors.js"
import {
  assertWorkspaceBillingSeatAuthorized,
  WorkspaceLicensesForbiddenError,
} from "../policies/billing-seat-enforcement-workspace.policy.js"
import type { WorkspaceBillingPortalService } from "../services/workspace-billing-portal.service.js"
import type { WorkspaceCommercialSubscriptionService } from "../services/workspace-commercial-subscription.service.js"
import type { WorkspaceBillingStateService } from "../services/workspace-billing-state.service.js"
import {
  billingCheckoutSessionBodySchema,
  billingSeatChangeBodySchema,
  billingWorkspacePublicIdParamsSchema,
} from "../validation/workspace-billing-http.schemas.js"

function actor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor as WorkspaceMemberState | undefined
  if (!a) {
    throw new Error("workspace_users_actor_missing")
  }
  return a
}

function handleError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof WorkspaceLicensesForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof WorkspaceCommercialSubscriptionError) {
    res.status(err.httpStatus).json({
      error: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    })
    return
  }
  if (err instanceof WorkspaceBillingPortalManualBillingError) {
    res.status(400).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof WorkspaceBillingPortalMissingLinkError) {
    res.status(409).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof WorkspaceBillingPortalPaddleUnavailableError) {
    const pe = err.paddleApiError
    res.status(502).json({
      error: err.code,
      message: err.message,
      ...(err.paddleHttpStatus !== undefined ? { paddleHttpStatus: err.paddleHttpStatus } : {}),
      ...(pe?.code ? { paddleErrorCode: pe.code } : {}),
      ...(pe?.requestId ? { paddleRequestId: pe.requestId } : {}),
      ...(pe?.detail ? { paddleErrorDetail: pe.detail } : {}),
    })
    return
  }
  if (err instanceof WorkspaceBillingInvariantError) {
    if (err.message === "workspace_license_not_found") {
      res.status(404).json({
        error: "workspace_billing_unavailable",
        message: "No hay licencia/base de asientos materializada para este workspace.",
      })
      return
    }
    if (err.message === "workspace_billing_snapshot_missing") {
      res.status(404).json({
        error: "workspace_billing_unavailable",
        message: "No hay estado de facturación materializado para este workspace.",
      })
      return
    }
    res.status(400).json({
      error: err.code,
      message: err.message,
    })
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

/** Montado bajo `/v1/workspaces/:workspacePublicId/billing`. */
export function createWorkspaceBillingSeatRouter(
  service: WorkspaceBillingStateService,
  portalService: WorkspaceBillingPortalService,
  commercialService: WorkspaceCommercialSubscriptionService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  workspaceAuditLogRepository: WorkspaceAuditLogRepository | null,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))

  const getState = async (req: Request, res: Response, next: NextFunction) => {
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

      assertWorkspaceBillingSeatAuthorized({ actor: actor(res), action: "view_state" })

      const envelope = await service.getBillingState(params.data.workspacePublicId)
      res.status(200).json({ ok: true, billing: envelope })
    } catch (err) {
      handleError(err, res, next)
    }
  }

  const postPortalSession = async (req: Request, res: Response, next: NextFunction) => {
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

      const out = await portalService.getCustomerPortalUrl(params.data.workspacePublicId)
      if (workspaceAuditLogRepository) {
        try {
          await workspaceAuditLogRepository.append({
            workspacePublicId: params.data.workspacePublicId,
            category: "workspace_billing_portal",
            action: "customer_portal_session_opened",
            actorUserPublicId: actor(res).userPublicId,
            occurredAt: new Date(),
            resource: {
              projectPublicId: WORKSPACE_AUDIT_GOVERNANCE_SENTINEL_PROJECT_PUBLIC_ID,
              backlogItemPublicId: null,
            },
            previousValue: null,
            nextValue: { provider: "paddle" },
          })
        } catch (err) {
          console.warn("[workspace-billing] workspace audit append failed", err)
        }
      }

      res.status(200).json({ ok: true, portalUrl: out.portalUrl })
    } catch (err) {
      handleError(err, res, next)
    }
  }

  const postCheckoutSession = async (req: Request, res: Response, next: NextFunction) => {
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
      const body = billingCheckoutSessionBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({
          error: "invalid_request",
          message: "Cuerpo inválido.",
          details: body.error.flatten(),
        })
        return
      }

      assertWorkspaceBillingSeatAuthorized({ actor: actor(res), action: "open_customer_portal" })

      const out = await commercialService.createCheckoutSession(params.data.workspacePublicId, body.data)

      if (workspaceAuditLogRepository) {
        try {
          await workspaceAuditLogRepository.append({
            workspacePublicId: params.data.workspacePublicId,
            category: "workspace_billing_commercial",
            action: "paddle_checkout_session_created",
            actorUserPublicId: actor(res).userPublicId,
            occurredAt: new Date(),
            resource: {
              projectPublicId: WORKSPACE_AUDIT_GOVERNANCE_SENTINEL_PROJECT_PUBLIC_ID,
              backlogItemPublicId: null,
            },
            previousValue: null,
            nextValue: {
              plan: body.data.plan,
              billingCadence: body.data.billingCadence,
              desiredSeats: body.data.desiredSeats ?? null,
              transactionId: out.transactionId,
            },
          })
        } catch (err) {
          console.warn("[workspace-billing] workspace audit append failed", err)
        }
      }

      res.status(200).json({ ok: true, checkoutUrl: out.checkoutUrl, transactionId: out.transactionId })
    } catch (err) {
      handleError(err, res, next)
    }
  }

  const postSeatIncrease = async (req: Request, res: Response, next: NextFunction) => {
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
      const body = billingSeatChangeBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({
          error: "invalid_request",
          message: "Cuerpo inválido.",
          details: body.error.flatten(),
        })
        return
      }

      assertWorkspaceBillingSeatAuthorized({ actor: actor(res), action: "open_customer_portal" })

      const out = await commercialService.increaseTeamSeats(
        params.data.workspacePublicId,
        body.data.desiredSeats,
      )

      if (!out.noop && workspaceAuditLogRepository) {
        try {
          await workspaceAuditLogRepository.append({
            workspacePublicId: params.data.workspacePublicId,
            category: "workspace_billing_commercial",
            action: "paddle_team_seat_increase_applied",
            actorUserPublicId: actor(res).userPublicId,
            occurredAt: new Date(),
            resource: {
              projectPublicId: WORKSPACE_AUDIT_GOVERNANCE_SENTINEL_PROJECT_PUBLIC_ID,
              backlogItemPublicId: null,
            },
            previousValue: null,
            nextValue: { desiredSeats: body.data.desiredSeats, subscriptionId: out.subscriptionId },
          })
        } catch (err) {
          console.warn("[workspace-billing] workspace audit append failed", err)
        }
      }

      res.status(200).json({ ok: true, subscriptionId: out.subscriptionId, noop: out.noop })
    } catch (err) {
      handleError(err, res, next)
    }
  }

  const postSeatReductionSchedule = async (req: Request, res: Response, next: NextFunction) => {
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
      const body = billingSeatChangeBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({
          error: "invalid_request",
          message: "Cuerpo inválido.",
          details: body.error.flatten(),
        })
        return
      }

      assertWorkspaceBillingSeatAuthorized({ actor: actor(res), action: "open_customer_portal" })

      const out = await commercialService.scheduleTeamSeatReduction(
        params.data.workspacePublicId,
        body.data.desiredSeats,
        { actorUserPublicId: actor(res).userPublicId },
      )

      if (workspaceAuditLogRepository) {
        try {
          await workspaceAuditLogRepository.append({
            workspacePublicId: params.data.workspacePublicId,
            category: "workspace_billing_commercial",
            action: "paddle_team_seat_reduction_scheduled",
            actorUserPublicId: actor(res).userPublicId,
            occurredAt: new Date(),
            resource: {
              projectPublicId: WORKSPACE_AUDIT_GOVERNANCE_SENTINEL_PROJECT_PUBLIC_ID,
              backlogItemPublicId: null,
            },
            previousValue: null,
            nextValue: { desiredSeats: body.data.desiredSeats, subscriptionId: out.subscriptionId },
          })
        } catch (err) {
          console.warn("[workspace-billing] workspace audit append failed", err)
        }
      }

      res.status(200).json({ ok: true, subscriptionId: out.subscriptionId })
    } catch (err) {
      handleError(err, res, next)
    }
  }

  const postUpgradeIndividualToTeam = async (req: Request, res: Response, next: NextFunction) => {
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
      const body = billingSeatChangeBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({
          error: "invalid_request",
          message: "Cuerpo inválido.",
          details: body.error.flatten(),
        })
        return
      }

      assertWorkspaceBillingSeatAuthorized({ actor: actor(res), action: "open_customer_portal" })

      const out = await commercialService.upgradeIndividualToTeam(
        params.data.workspacePublicId,
        body.data.desiredSeats,
      )

      if (workspaceAuditLogRepository) {
        try {
          await workspaceAuditLogRepository.append({
            workspacePublicId: params.data.workspacePublicId,
            category: "workspace_billing_commercial",
            action: "paddle_upgrade_individual_to_team_applied",
            actorUserPublicId: actor(res).userPublicId,
            occurredAt: new Date(),
            resource: {
              projectPublicId: WORKSPACE_AUDIT_GOVERNANCE_SENTINEL_PROJECT_PUBLIC_ID,
              backlogItemPublicId: null,
            },
            previousValue: null,
            nextValue: { desiredSeats: body.data.desiredSeats, subscriptionId: out.subscriptionId },
          })
        } catch (err) {
          console.warn("[workspace-billing] workspace audit append failed", err)
        }
      }

      res.status(200).json({ ok: true, subscriptionId: out.subscriptionId })
    } catch (err) {
      handleError(err, res, next)
    }
  }

  router.get("/state", getState)
  router.get("/summary", getState)
  router.post("/portal-session", postPortalSession)
  router.post("/checkout-session", postCheckoutSession)
  router.post("/seat-increase", postSeatIncrease)
  router.post("/seat-reduction-schedule", postSeatReductionSchedule)
  router.post("/upgrade-individual-to-team", postUpgradeIndividualToTeam)

  return router
}
