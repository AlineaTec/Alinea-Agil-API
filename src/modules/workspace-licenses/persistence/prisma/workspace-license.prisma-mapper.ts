import type { WorkspaceLicense } from "@prisma/client"
import type { WorkspaceLicenseState } from "../../domain/workspace-license-state.js"

export function workspaceLicenseFromPrisma(row: WorkspaceLicense): WorkspaceLicenseState {
  return {
    workspacePublicId: row.workspace_public_id,
    seatsPurchased: row.seats_purchased,
    seatsAssigned: row.seats_assigned,
    pendingSeatReduction:
      row.pending_reduction_target_purchased != null && row.pending_reduction_applies_on != null
        ? {
            targetPurchasedAfterRenewal: row.pending_reduction_target_purchased,
            appliesOn: row.pending_reduction_applies_on,
          }
        : null,
    nextRenewalDate: row.next_renewal_date,
    lastRenewalAt: row.last_renewal_at,
  }
}

export function workspaceLicenseToPrisma(state: WorkspaceLicenseState, workspaceId: string) {
  return {
    workspace_id: workspaceId,
    workspace_public_id: state.workspacePublicId,
    seats_purchased: state.seatsPurchased,
    seats_assigned: state.seatsAssigned,
    pending_reduction_target_purchased: state.pendingSeatReduction?.targetPurchasedAfterRenewal ?? null,
    pending_reduction_applies_on: state.pendingSeatReduction?.appliesOn ?? null,
    next_renewal_date: state.nextRenewalDate,
    last_renewal_at: state.lastRenewalAt,
  }
}
