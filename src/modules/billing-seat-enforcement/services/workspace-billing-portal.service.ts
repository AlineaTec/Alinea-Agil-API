import {
  createPaddleCustomerPortalSession,
  fetchPaddleSubscriptionCustomerId,
} from "../../../integrations/paddle/paddle-customer-portal.js"
import { WorkspaceBillingInvariantError } from "../domain/billing-seat-enforcement.errors.js"
import type { WorkspaceBillingSnapshotProps } from "../domain/workspace-billing-snapshot.js"
import {
  WorkspaceBillingPortalManualBillingError,
  WorkspaceBillingPortalMissingLinkError,
  WorkspaceBillingPortalPaddleUnavailableError,
} from "../domain/billing-portal.errors.js"
import type { WorkspaceBillingSnapshotRepository } from "../persistence/workspace-billing-snapshot.repository.js"

export type ResolvedWorkspaceBillingPortal = {
  portalUrl: string
}

export type PaddlePortalResolutionDeps = {
  fetchSubscriptionCustomerId: typeof fetchPaddleSubscriptionCustomerId
  createPortalSession: typeof createPaddleCustomerPortalSession
}

const defaultPaddleDeps: PaddlePortalResolutionDeps = {
  fetchSubscriptionCustomerId: fetchPaddleSubscriptionCustomerId,
  createPortalSession: createPaddleCustomerPortalSession,
}

/**
 * Genera URL efímera del Paddle Customer Portal (no cachear).
 * Requiere snapshot materializado y suscripción Paddle vinculada.
 */
export class WorkspaceBillingPortalService {
  constructor(private readonly snapshots: WorkspaceBillingSnapshotRepository) {}

  async getCustomerPortalUrl(workspacePublicId: string): Promise<ResolvedWorkspaceBillingPortal> {
    const row = await this.snapshots.findByWorkspacePublicId(workspacePublicId)
    return resolveWorkspaceBillingPortalUrl(row, process.env.PADDLE_API_KEY?.trim())
  }
}

export async function resolveWorkspaceBillingPortalUrl(
  row: WorkspaceBillingSnapshotProps | null,
  paddleApiKey: string | undefined,
  deps: PaddlePortalResolutionDeps = defaultPaddleDeps,
): Promise<ResolvedWorkspaceBillingPortal> {
  if (!row) {
    throw new WorkspaceBillingInvariantError("workspace_billing_snapshot_missing")
  }

  if (row.billingSource === "manual") {
    throw new WorkspaceBillingPortalManualBillingError()
  }

  const subId = row.subscriptionExternalId?.trim()
  if (!subId) {
    throw new WorkspaceBillingPortalMissingLinkError()
  }

  if (!paddleApiKey) {
    throw new WorkspaceBillingPortalPaddleUnavailableError(
      "El servidor no tiene configurada la integración Paddle para abrir el portal de facturación.",
    )
  }

  const cust = await deps.fetchSubscriptionCustomerId(subId, paddleApiKey)
  if (!cust.ok) {
    throw new WorkspaceBillingPortalPaddleUnavailableError(
      `Paddle no devolvió la suscripción (${cust.httpStatus}).`,
      cust.httpStatus,
      cust.paddleApiError,
    )
  }

  const portal = await deps.createPortalSession(cust.customerId, paddleApiKey, {
    subscriptionIds: [subId],
  })

  if (!portal.ok) {
    console.warn("[workspace-billing-portal] createPortalSession failed", {
      httpStatus: portal.httpStatus,
      subscriptionId: subId,
      paddleApiError: portal.paddleApiError,
      bodySnippet: portal.bodySnippet.length > 280 ? `${portal.bodySnippet.slice(0, 280)}…` : portal.bodySnippet,
    })
    throw new WorkspaceBillingPortalPaddleUnavailableError(
      `Paddle no pudo crear la sesión del portal (${portal.httpStatus}).`,
      portal.httpStatus,
      portal.paddleApiError,
    )
  }

  return { portalUrl: portal.portalUrl }
}
