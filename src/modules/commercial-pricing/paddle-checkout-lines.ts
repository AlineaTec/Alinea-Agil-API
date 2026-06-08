import type { BillingCadence, CommercialPlanKind } from "./commercial-pricing.constants.js"
import type { PaddlePriceCatalog } from "./paddle-price-catalog.js"
import { effectiveTeamSeatsPurchased } from "./compute-commercial-quote.js"

export type PaddleCheckoutLine = {
  priceId: string
  quantity: number
}

function pickTeamPriceId(catalog: PaddlePriceCatalog, _cadence: BillingCadence): string {
  return catalog.teamBaseMonthly
}

function pickAdditionalPriceId(catalog: PaddlePriceCatalog, _cadence: BillingCadence): string {
  return catalog.additionalSeatMonthly
}

function pickIndividualPriceId(catalog: PaddlePriceCatalog, _cadence: BillingCadence): string {
  return catalog.individualMonthly
}

/** `max(0, effectiveTeamSeats − 3)` — expansion solo vía Additional Seat. */
export function additionalSeatQuantityFromDesiredTeamSeats(teamSeatsRequested: number | undefined): number {
  const eff = effectiveTeamSeatsPurchased(teamSeatsRequested ?? 3)
  return Math.max(0, eff - 3)
}

/**
 * Construcción de líneas para **una** suscripción Paddle (mismo billing interval en todas).
 * Individual: un solo item qty 1. Team: Team Base qty 1 + Additional Seat si >3 asientos.
 */
export function buildPaddleSubscriptionCheckoutLines(input: {
  plan: CommercialPlanKind
  billingCadence: BillingCadence
  /** Solo Team: asientos totales deseados (el servidor aplica mín. 3). */
  teamSeatsRequested?: number
  catalog: PaddlePriceCatalog
}):
  | { ok: true; lines: PaddleCheckoutLine[] }
  | { ok: false; reason: "individual_rejects_addon" | "empty_catalog" } {
  const { plan, billingCadence, catalog } = input

  if (plan === "individual") {
    const priceId = pickIndividualPriceId(catalog, billingCadence)
    if (!priceId.trim()) return { ok: false, reason: "empty_catalog" }
    return { ok: true, lines: [{ priceId, quantity: 1 }] }
  }

  const baseId = pickTeamPriceId(catalog, billingCadence)
  if (!baseId.trim()) return { ok: false, reason: "empty_catalog" }

  const lines: PaddleCheckoutLine[] = [{ priceId: baseId, quantity: 1 }]
  const addQty = additionalSeatQuantityFromDesiredTeamSeats(input.teamSeatsRequested)
  if (addQty > 0) {
    const addId = pickAdditionalPriceId(catalog, billingCadence)
    if (!addId.trim()) return { ok: false, reason: "empty_catalog" }
    lines.push({ priceId: addId, quantity: addQty })
  }
  return { ok: true, lines }
}
