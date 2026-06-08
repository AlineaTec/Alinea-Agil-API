import type { Router } from "express"

import type { BillingRepositories } from "../../infrastructure/persistence/billing-repositories.factory.js"
import { requireInjected } from "../../infrastructure/persistence/require-injected.js"
import {
  createPaddleCommercialReconcileService,
  createWorkspaceBillingStateService,
} from "../billing-seat-enforcement/billing-seat-enforcement.module.js"
import type { PlatformAuditService } from "../platform-users/services/platform-audit.service.js"
import type { WorkspaceCatalogRepository } from "../platform-tenants/persistence/workspace-catalog.repository.js"
import { createWorkspaceLicenseService } from "../workspace-licenses/workspace-licenses.module.js"
import type { WorkspaceMemberRepository } from "../workspace-users/persistence/workspace-member.repository.js"

import { createPlatformBillingOperationsRouter } from "./routes/platform-billing-operations.routes.js"
import { PlatformBillingOperationsService } from "./services/platform-billing-operations.service.js"

import type { PaymentReceiptAccessService } from "../payment-receipts/services/payment-receipt-access.service.js"
import { mountPaymentReceiptsPlatformRoutes } from "../payment-receipts/payment-receipts.module.js"

export function mountPlatformBillingOperationsRoutes(
  platformRouter: Router,
  platformAudit: PlatformAuditService,
  paymentReceiptAccess?: PaymentReceiptAccessService | null,
  billing?: BillingRepositories,
  workspaceMembers?: WorkspaceMemberRepository,
  workspaceCatalog?: WorkspaceCatalogRepository,
): void {
  const members = requireInjected(workspaceMembers, "workspaceMembers")
  const catalog = requireInjected(workspaceCatalog, "workspaceCatalog")
  const billingRepos = requireInjected(billing, "billing")
  const licenses = createWorkspaceLicenseService()
  const billingState = createWorkspaceBillingStateService({
    workspaceLicenseService: licenses,
    workspaceMemberRepository: members,
    workspaceCatalog: catalog,
    billing: billingRepos,
  })
  const reconcile = createPaddleCommercialReconcileService({
    workspaceBillingStateService: billingState,
    workspaceLicenseService: licenses,
    billing: billingRepos,
  })
  const service = new PlatformBillingOperationsService(
    billingRepos.snapshot,
    billingRepos.workspaceBillingAudit,
    billingRepos.notificationSent,
    members,
    catalog,
    reconcile,
    platformAudit,
  )
  platformRouter.use(createPlatformBillingOperationsRouter(service))
  if (paymentReceiptAccess) {
    mountPaymentReceiptsPlatformRoutes(platformRouter, paymentReceiptAccess)
  }
}
