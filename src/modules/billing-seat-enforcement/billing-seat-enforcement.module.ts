import type { WorkspaceAuditLogRepository } from "../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import type { Express, RequestHandler } from "express"
import type { BillingRepositories } from "../../infrastructure/persistence/billing-repositories.factory.js"
import { createBillingRepositories } from "../../infrastructure/persistence/billing-repositories.factory.js"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import type { WorkspaceUserService } from "../workspace-users/services/workspace-user.service.js"
import type { TransactionalEmailService } from "../transactional-email/services/transactional-email.service.js"
import type { BillingNotificationPort } from "./domain/billing-notification-port.js"
import type { WorkspaceIdentityRepository } from "../workspace-users/persistence/workspace-identity.repository.js"
import { WorkspaceBillingNotificationService } from "./services/workspace-billing-notification.service.js"
import { createWorkspaceBillingSeatRouter } from "./routes/workspace-billing.routes.js"
import { mountPaddleBillingWebhookRoutes } from "./routes/paddle-webhooks.routes.js"
import { PaddleBillingWebhookIngestionService } from "./services/paddle-webhook-ingestion.service.js"
import { WorkspaceBillingPortalService } from "./services/workspace-billing-portal.service.js"
import {
  WorkspaceCommercialSubscriptionService,
  createWorkspaceCommercialSubscriptionService,
} from "./services/workspace-commercial-subscription.service.js"
import { WorkspaceBillingStateService } from "./services/workspace-billing-state.service.js"
import { createWorkspaceSeatExpansionGate } from "./services/workspace-seat-expansion.gate.js"
import { createWorkspaceBillingPrimaryProductMutationGate } from "./middleware/workspace-billing-primary-product.middleware.js"
import type { WorkspaceLicenseService } from "../workspace-licenses/services/workspace-license.service.js"
import type { WorkspaceMemberRepository } from "../workspace-users/persistence/workspace-member.repository.js"
import type { WorkspaceCatalogRepository } from "../platform-tenants/persistence/workspace-catalog.repository.js"
import { mountPaymentReceiptsWorkspaceRoutes } from "../payment-receipts/payment-receipts.module.js"
import type { PaymentReceiptWebhookBridge } from "../payment-receipts/services/payment-receipt-webhook.bridge.js"
import type { PaymentReceiptAccessService } from "../payment-receipts/services/payment-receipt-access.service.js"
import {
  PaddleCommercialReconcileService,
  createPaddleCommercialReconcileService as buildPaddleCommercialReconcileService,
  type PaddleCommercialReconcileResult,
} from "./services/paddle-commercial-reconcile.service.js"

export function createWorkspaceBillingPortalService(
  billing: BillingRepositories = createBillingRepositories(),
): WorkspaceBillingPortalService {
  return new WorkspaceBillingPortalService(billing.snapshot)
}

export { WorkspaceBillingPortalService }
export { WorkspaceBillingStateService }
export { WorkspaceCommercialSubscriptionService, createWorkspaceCommercialSubscriptionService }
export { WorkspaceBillingNotificationService }
export { createWorkspaceSeatExpansionGate }
export { createWorkspaceBillingPrimaryProductMutationGate }
export type BillingPrimaryProductMutationGate = RequestHandler

export function createWorkspaceBillingNotificationService(
  transactionalEmail: TransactionalEmailService,
  workspaceMembers: WorkspaceMemberRepository,
  billing: BillingRepositories,
  workspaceIdentity: WorkspaceIdentityRepository,
): WorkspaceBillingNotificationService {
  return new WorkspaceBillingNotificationService(
    transactionalEmail,
    workspaceMembers,
    workspaceIdentity,
    billing.snapshot,
    billing.notificationSent,
  )
}

export function createWorkspaceBillingStateService(options: {
  workspaceLicenseService: WorkspaceLicenseService
  workspaceMemberRepository: WorkspaceMemberRepository
  billingNotifications?: BillingNotificationPort
  workspaceCatalog?: WorkspaceCatalogRepository | null
  billing?: BillingRepositories
}): WorkspaceBillingStateService {
  const billing = options.billing ?? createBillingRepositories()
  return new WorkspaceBillingStateService(
    billing.snapshot,
    billing.workspaceBillingAudit,
    options.workspaceMemberRepository,
    options.workspaceLicenseService,
    options.billingNotifications,
    options.workspaceCatalog ?? null,
  )
}

export function createPaddleBillingWebhookIngestionService(options: {
  workspaceBillingStateService: WorkspaceBillingStateService
  workspaceLicenseService: WorkspaceLicenseService
  paymentReceiptBridge?: PaymentReceiptWebhookBridge | null
  billing?: BillingRepositories
}): PaddleBillingWebhookIngestionService {
  const billing = options.billing ?? createBillingRepositories()
  return new PaddleBillingWebhookIngestionService(
    billing.snapshot,
    billing.paddleWebhook,
    options.workspaceBillingStateService,
    options.workspaceLicenseService,
    options.paymentReceiptBridge ?? null,
  )
}

export { PaddleCommercialReconcileService, type PaddleCommercialReconcileResult }

export function createPaddleCommercialReconcileService(options: {
  workspaceBillingStateService: WorkspaceBillingStateService
  workspaceLicenseService: WorkspaceLicenseService
  billing?: BillingRepositories
}): PaddleCommercialReconcileService {
  const billing = options.billing ?? createBillingRepositories()
  return buildPaddleCommercialReconcileService({
    workspaceBillingStateService: options.workspaceBillingStateService,
    workspaceLicenseService: options.workspaceLicenseService,
    workspaceBillingSnapshotRepository: billing.snapshot,
  })
}

export function mountPaddleBillingWebhookIntegration(
  app: Express,
  options: {
    ingestion: PaddleBillingWebhookIngestionService
    webhookSecret: string
  },
): void {
  mountPaddleBillingWebhookRoutes(app, {
    ingestion: options.ingestion,
    webhookSecret: options.webhookSecret,
  })
}

export type MountBillingSeatEnforcementModuleOptions = {
  billingStateService: WorkspaceBillingStateService
  billingPortalService: WorkspaceBillingPortalService
  commercialSubscriptionService: WorkspaceCommercialSubscriptionService
  authBearerService: AuthBearerService
  workspaceUserService: WorkspaceUserService
  workspaceAuditLogRepository?: WorkspaceAuditLogRepository | null
  paymentReceiptAccess?: PaymentReceiptAccessService | null
}

/**
 * Endpoints bajo `/v1/workspaces/:workspacePublicId/billing/…`.
 */
export function mountBillingSeatEnforcementModule(
  app: Express,
  options: MountBillingSeatEnforcementModuleOptions,
): void {
  const billingRouter = createWorkspaceBillingSeatRouter(
    options.billingStateService,
    options.billingPortalService,
    options.commercialSubscriptionService,
    options.authBearerService,
    options.workspaceUserService,
    options.workspaceAuditLogRepository ?? null,
  )
  if (options.paymentReceiptAccess) {
    mountPaymentReceiptsWorkspaceRoutes(billingRouter, {
      access: options.paymentReceiptAccess,
      authBearerService: options.authBearerService,
      workspaceUserService: options.workspaceUserService,
    })
  }
  app.use("/v1/workspaces/:workspacePublicId/billing", billingRouter)
}
