import { BillingSeatExpansionBlockedError } from "./billing-seat-expansion.errors.js"
import type { WorkspaceBillingPublicState } from "./workspace-billing-public-state.js"

/**
 * Enforcement centralizado para acciones que **incrementan** usuarios efectivos con asiento (`active` + `hasSeatAssigned`).
 *
 * - Solo **`currentEntitledSeats`** y uso actual cuentan; capacidad **programada futura** no relaja el guard (materializada ya en `getBillingState`).
 * - Separación explícita: sobrecapacidad vs agotamiento de cupo vs suspensión por impago vs estado comercial terminal.
 */
export function assertCanExpandSeatConsumptionFromPublicState(state: WorkspaceBillingPublicState): void {
  const terminal = state.billingStatus === "cancelled" || state.billingStatus === "expired"
  if (terminal) {
    throw BillingSeatExpansionBlockedError.commercialTerminal(state.billingStatus as "cancelled" | "expired")
  }

  if (state.guards.canInviteSeatConsumingMembers) {
    return
  }

  const r = state.guards.expansionBlockedReason
  if (r === "suspended_non_payment") {
    throw BillingSeatExpansionBlockedError.suspendedNonPayment()
  }
  if (r === "over_capacity_regularization") {
    throw BillingSeatExpansionBlockedError.overCapacity()
  }
  if (r === "seat_capacity_exhausted") {
    throw BillingSeatExpansionBlockedError.seatExhausted()
  }

  throw BillingSeatExpansionBlockedError.fallback()
}
