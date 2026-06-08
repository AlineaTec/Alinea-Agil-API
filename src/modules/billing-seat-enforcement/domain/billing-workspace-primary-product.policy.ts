import { BillingWorkspacePrimaryProductBlockedError } from "./billing-workspace-primary-product.errors.js"
import type { WorkspaceBillingPublicState } from "./workspace-billing-public-state.js"

/**
 * Paths de request (sin querystring) para mutaciones que deben poder ejecutarse durante suspensión/terminal:
 * facturación, licencias/capacidad, configuración mínima del workspace, reducción de consumo (release/deactivate seat).
 *
 * Mantener alineado con README del módulo (lista de exenciones).
 */
export function isBillingPrimaryProductMutationExempt(fullPathWithoutQuery: string): boolean {
  const p = fullPathWithoutQuery
  return (
    /\/billing(\/|$)/.test(p) ||
    /\/license(\/|$)/.test(p) ||
    /\/settings(\/|$)/.test(p) ||
    /\/members\/[^/]+\/(deactivate|release-seat)(\/|$)/.test(p)
  )
}

/**
 * `@throws BillingWorkspacePrimaryProductBlockedError` si el estado materializado niega uso principal.
 */
export function assertCanUsePrimaryWorkspaceProductFeatures(state: WorkspaceBillingPublicState): void {
  if (state.guards.canUsePrimaryWorkspaceProductFeatures) return

  if (state.billingStatus === "suspended_non_payment") {
    throw BillingWorkspacePrimaryProductBlockedError.suspendedNonPayment()
  }
  if (state.billingStatus === "cancelled" || state.billingStatus === "expired") {
    throw BillingWorkspacePrimaryProductBlockedError.commercialTerminal(state.billingStatus)
  }
}
