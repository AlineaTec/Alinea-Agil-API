import type { WorkspaceLicenseState } from "./workspace-license-state.js"
import { computeSeatsAvailable } from "./workspace-license-state.js"

export class SeatCapacityInvariantError extends Error {
  readonly code = "seat_capacity_invariant"

  constructor(message: string) {
    super(message)
    this.name = "SeatCapacityInvariantError"
  }
}

export class SeatReductionScheduleError extends Error {
  readonly code = "seat_reduction_schedule"

  constructor(message: string) {
    super(message)
    this.name = "SeatReductionScheduleError"
  }
}

/** Contratados efectivos deben ser ≥ asignados siempre. */
export function assertPurchasedCoversAssigned(seatsPurchased: number, seatsAssigned: number): void {
  if (seatsPurchased < seatsAssigned) {
    throw new SeatCapacityInvariantError(
      `seatsPurchased (${seatsPurchased}) must be >= seatsAssigned (${seatsAssigned})`,
    )
  }
}

/** Tras aumentar asignados, debe haber disponibles. */
export function assertCanAssignSeats(state: WorkspaceLicenseState, additionalAssignCount: number): void {
  if (additionalAssignCount <= 0) return
  const avail = computeSeatsAvailable(state)
  if (avail < additionalAssignCount) {
    throw new SeatCapacityInvariantError(
      `insufficient seatsAvailable: need ${additionalAssignCount}, have ${avail}`,
    )
  }
}

/**
 * Programar reducción: el contratado aplicado el próximo día 1 no puede quedar por debajo
 * de los asignados actuales (WL-DEC en contracts-docs).
 */
export function assertScheduleReductionValid(
  seatsPurchased: number,
  seatsAssigned: number,
  targetPurchasedAfterRenewal: number,
): void {
  if (!Number.isInteger(targetPurchasedAfterRenewal) || targetPurchasedAfterRenewal < 0) {
    throw new SeatReductionScheduleError("targetPurchasedAfterRenewal must be a non-negative integer")
  }
  if (targetPurchasedAfterRenewal < seatsAssigned) {
    throw new SeatReductionScheduleError(
      `targetPurchasedAfterRenewal (${targetPurchasedAfterRenewal}) must be >= seatsAssigned (${seatsAssigned})`,
    )
  }
  if (targetPurchasedAfterRenewal > seatsPurchased) {
    throw new SeatReductionScheduleError(
      `targetPurchasedAfterRenewal (${targetPurchasedAfterRenewal}) cannot exceed current seatsPurchased (${seatsPurchased}); use increase instead`,
    )
  }
}

export function assertIncreaseValid(increment: number): void {
  if (!Number.isInteger(increment) || increment <= 0) {
    throw new SeatCapacityInvariantError("increment must be a positive integer")
  }
}
