import { assertCanExpandSeatConsumptionFromPublicState } from "../domain/billing-seat-expansion.policy.js"
import type { WorkspaceSeatExpansionGate } from "../domain/workspace-seat-expansion-gate.js"
import type { WorkspaceBillingStateService } from "./workspace-billing-state.service.js"

export function createWorkspaceSeatExpansionGate(
  billingStateService: WorkspaceBillingStateService,
): WorkspaceSeatExpansionGate {
  return {
    async assertCanExpandSeatConsumption(workspacePublicId: string): Promise<void> {
      const pub = await billingStateService.getBillingState(workspacePublicId)
      assertCanExpandSeatConsumptionFromPublicState(pub)
    },
  }
}
