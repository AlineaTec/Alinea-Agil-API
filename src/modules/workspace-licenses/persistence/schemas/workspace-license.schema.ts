/**
 * Persistencia del estado de licencias por workspace.
 * `seatsAvailable` no se guarda; se calcula en dominio.
 */
export interface WorkspaceLicenseDocProps {
  workspacePublicId: string
  seatsPurchased: number
  seatsAssigned: number
  pendingSeatReduction: {
    targetPurchasedAfterRenewal: number
    appliesOn: Date
  } | null
  nextRenewalDate: Date
  lastRenewalAt: Date | null
}
