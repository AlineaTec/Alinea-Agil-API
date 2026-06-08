import type { TransactionalEmailService } from "../transactional-email/services/transactional-email.service.js"
import type { WorkspaceBillingStateService } from "../billing-seat-enforcement/services/workspace-billing-state.service.js"
import type { WorkspaceMemberRepository } from "../workspace-users/persistence/workspace-member.repository.js"
import type { WorkspaceIdentityRepository } from "../workspace-users/persistence/workspace-identity.repository.js"
import type { BillingRepositories } from "../../infrastructure/persistence/billing-repositories.factory.js"
import { PaymentReceiptEmissionService } from "./services/payment-receipt-emission.service.js"
import { getPaymentReceiptStorageRoot, PaymentReceiptLocalFileStorage } from "./services/payment-receipt-local.storage.js"
import { PaymentReceiptWebhookBridge } from "./services/payment-receipt-webhook.bridge.js"
import { createPlatformPaymentReceiptsRouter } from "./routes/platform-payment-receipts.routes.js"
import { createWorkspacePaymentReceiptsRouter } from "./routes/workspace-payment-receipts.routes.js"
import type { Router } from "express"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import type { WorkspaceUserService } from "../workspace-users/services/workspace-user.service.js"
import { PaymentReceiptAccessService } from "./services/payment-receipt-access.service.js"
import type { PaymentReceiptOrphanEventRepository } from "./persistence/payment-receipt-orphan.repository.js"

export { PaymentReceiptWebhookBridge }
export { PaymentReceiptAccessService }
export { PaymentReceiptEmissionService }
export { createWorkspacePaymentReceiptsRouter }
export { createPlatformPaymentReceiptsRouter }

export function createPaymentReceiptAccessService(
  workspaceBillingStateService: WorkspaceBillingStateService,
  billing: BillingRepositories,
): PaymentReceiptAccessService {
  return new PaymentReceiptAccessService(
    billing.paymentReceipt,
    new PaymentReceiptLocalFileStorage(getPaymentReceiptStorageRoot()),
    workspaceBillingStateService,
  )
}

export function createPaymentReceiptWebhookBridge(options: {
  workspaceBillingStateService: WorkspaceBillingStateService
  transactionalEmail: TransactionalEmailService
  workspaceMemberRepository: WorkspaceMemberRepository
  billing: BillingRepositories
  workspaceIdentity: WorkspaceIdentityRepository
}): PaymentReceiptWebhookBridge {
  const storage = new PaymentReceiptLocalFileStorage(getPaymentReceiptStorageRoot())
  const emission = new PaymentReceiptEmissionService(
    options.billing.paymentReceipt,
    options.billing.yearSequence,
    options.billing.snapshot,
    options.workspaceBillingStateService,
    options.workspaceIdentity,
    options.workspaceMemberRepository,
    storage,
    options.transactionalEmail,
  )
  return new PaymentReceiptWebhookBridge(emission, options.billing.orphanEvent)
}

export function mountPaymentReceiptsPlatformRoutes(platformRouter: Router, access: PaymentReceiptAccessService): void {
  platformRouter.use(createPlatformPaymentReceiptsRouter(access))
}

export function mountPaymentReceiptsWorkspaceRoutes(
  billingRouter: Router,
  options: {
    access: PaymentReceiptAccessService
    authBearerService: AuthBearerService
    workspaceUserService: WorkspaceUserService
  },
): void {
  billingRouter.use(
    createWorkspacePaymentReceiptsRouter(
      options.access,
      options.authBearerService,
      options.workspaceUserService,
    ),
  )
}

/** Para tests o wiring manual sin instanciar todo el módulo HTTP. */
export function createPaymentReceiptWebhookBridgeForTest(
  emission: PaymentReceiptEmissionService,
  orphans: PaymentReceiptOrphanEventRepository,
): PaymentReceiptWebhookBridge {
  return new PaymentReceiptWebhookBridge(emission, orphans)
}
