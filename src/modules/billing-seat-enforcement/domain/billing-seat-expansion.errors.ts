import type { BillingExpansionBlockReason } from "./workspace-billing-snapshot.js"

export type BillingSeatExpansionBlockCode =
  | "billing_expansion_blocked_over_capacity"
  | "billing_expansion_blocked_seat_exhausted"
  | "billing_expansion_blocked_suspended_non_payment"
  | "billing_expansion_blocked_commercial_terminal"
  | "billing_expansion_blocked"

/**
 * Bloqueo de expansión de cupo (invitar con asiento, asignar asiento). Separado de errores de capacidad de licencia pura.
 *
 * HTTP típico: **403** (`routes/workspace-users.routes.ts`).
 */
export class BillingSeatExpansionBlockedError extends Error {
  readonly code: BillingSeatExpansionBlockCode
  /** Coherent con `WorkspaceBillingPublicState.guards.expansionBlockedReason` cuando aplica. */
  readonly expansionBlockedReason: BillingExpansionBlockReason | "commercial_terminal" | null

  constructor(
    code: BillingSeatExpansionBlockCode,
    message: string,
    expansionBlockedReason: BillingExpansionBlockReason | "commercial_terminal" | null,
  ) {
    super(message)
    this.name = "BillingSeatExpansionBlockedError"
    this.code = code
    this.expansionBlockedReason = expansionBlockedReason
  }

  static commercialTerminal(billingStatus: "cancelled" | "expired"): BillingSeatExpansionBlockedError {
    return new BillingSeatExpansionBlockedError(
      "billing_expansion_blocked_commercial_terminal",
      billingStatus === "cancelled"
        ? "La suscripción está cancelada; no se pueden añadir usuarios con asiento hasta regularizar el estado comercial."
        : "La suscripción ha expirado; no se pueden añadir usuarios con asiento hasta renovar o regularizar.",
      "commercial_terminal",
    )
  }

  static suspendedNonPayment(): BillingSeatExpansionBlockedError {
    return new BillingSeatExpansionBlockedError(
      "billing_expansion_blocked_suspended_non_payment",
      "La organización está suspendida por impago; no se pueden invitar ni asignar asientos hasta regularizar el cobro.",
      "suspended_non_payment",
    )
  }

  static overCapacity(): BillingSeatExpansionBlockedError {
    return new BillingSeatExpansionBlockedError(
      "billing_expansion_blocked_over_capacity",
      "Hay más usuarios activos con asiento que el cupo contratado; reduce uso u aumenta capacidad antes de añadir más.",
      "over_capacity_regularization",
    )
  }

  static seatExhausted(): BillingSeatExpansionBlockedError {
    return new BillingSeatExpansionBlockedError(
      "billing_expansion_blocked_seat_exhausted",
      "No hay asientos disponibles en el cupo actual; contrata más capacidad o libera un asiento antes de añadir otro.",
      "seat_capacity_exhausted",
    )
  }

  static fallback(): BillingSeatExpansionBlockedError {
    return new BillingSeatExpansionBlockedError(
      "billing_expansion_blocked",
      "La política de facturación impide ampliar usuarios con asiento en este momento.",
      null,
    )
  }
}
