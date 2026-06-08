import type { WorkspaceLicenseState } from "../../domain/workspace-license-state.js"
import type { WorkspaceLicenseDocProps } from "../schemas/workspace-license.schema.js"

export function docToState(doc: WorkspaceLicenseDocProps): WorkspaceLicenseState {
  return {
    workspacePublicId: doc.workspacePublicId,
    seatsPurchased: doc.seatsPurchased,
    seatsAssigned: doc.seatsAssigned,
    pendingSeatReduction: doc.pendingSeatReduction
      ? {
          targetPurchasedAfterRenewal: doc.pendingSeatReduction.targetPurchasedAfterRenewal,
          appliesOn: doc.pendingSeatReduction.appliesOn,
        }
      : null,
    nextRenewalDate: doc.nextRenewalDate,
    lastRenewalAt: doc.lastRenewalAt ?? null,
  }
}

export function stateToDocProps(state: WorkspaceLicenseState): WorkspaceLicenseDocProps {
  return {
    workspacePublicId: state.workspacePublicId,
    seatsPurchased: state.seatsPurchased,
    seatsAssigned: state.seatsAssigned,
    pendingSeatReduction: state.pendingSeatReduction,
    nextRenewalDate: state.nextRenewalDate,
    lastRenewalAt: state.lastRenewalAt,
  }
}
