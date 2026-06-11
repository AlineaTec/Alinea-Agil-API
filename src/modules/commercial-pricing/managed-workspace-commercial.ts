import type { BillingCadence, CommercialPlanKind } from "./commercial-pricing.constants.js"
import { resolveActiveBillingCadence, type StoredBillingCadence } from "./billing-cadence.js"
import type { CommercialPlanTier } from "./commercial-pricing.constants.js"
import {
  ADDITIONAL_SEAT_MONTHLY_USD,
  INDIVIDUAL_MONTHLY_USD,
  TEAM_BASE_MONTHLY_USD,
  LEGACY_TEAM_MIN_SEATS,
} from "./commercial-pricing.constants.js"
import { type CommercialQuote, computeCommercialQuote } from "./compute-commercial-quote.js"

/**
 * Cotización comercial para un workspace ya provisionado (admin / reportes).
 * Sin fila de licencia operativa no hay base de contrato → incompleto (misma regla que `billingEstimate` en tenants).
 */
export type ManagedWorkspaceCommercialOk = {
  ok: true
  quote: CommercialQuote
  billingCadenceUsed: BillingCadence
  /** `true` si el workspace no tenía `billingCadence` persistido y se asumió mensual. */
  billingCadenceAssumedMonthly: boolean
  /** Asientos de contrato mostrados (1 en Individual; `seatsPurchased` en Team). */
  seatsContracted: number
}

export type ManagedWorkspaceCommercialIncomplete = {
  ok: false
  reason: "missing_license"
}

export function computeManagedWorkspaceCommercial(input: {
  plan: CommercialPlanKind
  billingCadence?: StoredBillingCadence
  license: { seatsPurchased: number } | null
  planTier?: CommercialPlanTier
}): ManagedWorkspaceCommercialOk | ManagedWorkspaceCommercialIncomplete {
  if (input.license === null) {
    return { ok: false, reason: "missing_license" }
  }
  const billingCadenceUsed = resolveActiveBillingCadence(input.billingCadence)
  const quote = computeCommercialQuote({
    plan: input.plan,
    billingCadence: billingCadenceUsed,
    teamSeatsRequested: input.plan === "team" ? input.license.seatsPurchased : undefined,
    planTier: input.planTier,
  })
  const seatsContracted = input.plan === "team" ? input.license.seatsPurchased : 1
  return {
    ok: true,
    quote,
    billingCadenceUsed,
    billingCadenceAssumedMonthly: input.billingCadence === undefined,
    seatsContracted,
  }
}

/** Texto corto para paneles admin (misma lógica numérica que el quote). */
export function describeManagedWorkspaceCommercialEs(
  line: ManagedWorkspaceCommercialOk,
): string {
  const q = line.quote
  const cadence = "Mensual"
  if (q.plan === "individual") {
    return `${cadence} · Individual · lista USD ${INDIVIDUAL_MONTHLY_USD}/mes · ${q.seatsBilled} asiento facturable · total periodo USD ${q.totalDueUsd.toFixed(2)} · equivalente mensual USD ${q.equivalentMonthlyUsd.toFixed(2)}`
  }
  const seatsEff = q.seatsBilled
  const minNote =
    line.seatsContracted < LEGACY_TEAM_MIN_SEATS
      ? ` (mín. facturación legado ${LEGACY_TEAM_MIN_SEATS})`
      : ""
  return `${cadence} · Team · ${seatsEff} asientos · base USD ${TEAM_BASE_MONTHLY_USD}/mes + addon USD ${ADDITIONAL_SEAT_MONTHLY_USD}/mes${minNote} · total mes USD ${q.totalDueUsd.toFixed(2)} · equiv. mensual USD ${q.equivalentMonthlyUsd.toFixed(2)}`
}
