import type { BillingCadence, CommercialPlanKind, CommercialPlanTier } from "./commercial-pricing.constants.js"
import type { PaddlePriceCatalog, PaddlePriceRole } from "./paddle-price-catalog.js"
import { resolvePriceRoleInCatalog } from "./paddle-price-catalog.js"
import {
  effectiveLegacyTeamSeatsPurchased,
  effectivePaidTierSeats,
} from "./compute-commercial-quote.js"

export type PaddleCheckoutLine = {
  priceId: string
  quantity: number
}

/** `max(0, effectiveLegacyTeamSeats − 3)` — expansión modelo Paddle legado. */
export function additionalSeatQuantityFromDesiredTeamSeats(teamSeatsRequested: number | undefined): number {
  const eff = effectiveLegacyTeamSeatsPurchased(teamSeatsRequested ?? 3)
  return Math.max(0, eff - 3)
}

/**
 * Construcción de líneas para **una** suscripción Paddle (facturación mensual).
 * Modelo tier: una línea por licencia (qty = asientos). Modelo legado: base 3 + addon.
 */
export function buildPaddleSubscriptionCheckoutLines(input: {
  plan: CommercialPlanKind
  billingCadence: BillingCadence
  /** Solo Team: asientos totales deseados. */
  teamSeatsRequested?: number
  /** Estándar / Profesional cuando el catálogo usa precios por licencia. */
  planTier?: CommercialPlanTier
  catalog: PaddlePriceCatalog
}):
  | { ok: true; lines: PaddleCheckoutLine[] }
  | { ok: false; reason: "individual_rejects_addon" | "empty_catalog" | "tier_required" } {
  const { plan, catalog } = input

  if (catalog.tierPerSeatModel) {
    const tier = input.planTier
    if (tier !== "estandar" && tier !== "profesional") {
      return { ok: false, reason: "tier_required" }
    }
    const seats = effectivePaidTierSeats(input.teamSeatsRequested)
    const priceId =
      tier === "profesional" ? catalog.profesionalLicenseMonthly : catalog.estandarLicenseMonthly
    if (!priceId.trim()) return { ok: false, reason: "empty_catalog" }
    return { ok: true, lines: [{ priceId, quantity: seats }] }
  }

  if (plan === "individual") {
    const priceId = catalog.individualMonthly
    if (!priceId.trim()) return { ok: false, reason: "empty_catalog" }
    return { ok: true, lines: [{ priceId, quantity: 1 }] }
  }

  const baseId = catalog.teamBaseMonthly
  if (!baseId.trim()) return { ok: false, reason: "empty_catalog" }

  const lines: PaddleCheckoutLine[] = [{ priceId: baseId, quantity: 1 }]
  const addQty = additionalSeatQuantityFromDesiredTeamSeats(input.teamSeatsRequested)
  if (addQty > 0) {
    const addId = catalog.additionalSeatMonthly
    if (!addId.trim()) return { ok: false, reason: "empty_catalog" }
    lines.push({ priceId: addId, quantity: addQty })
  }
  return { ok: true, lines }
}

export type PaddleCheckoutLinePresentation = {
  priceId: string
  quantity: number
  productRole: PaddlePriceRole["productRole"]
  interval: BillingCadence
  priceIdSuffix: string
}

/** Líneas de checkout con rol comercial para respuestas HTTP (registro / admin). */
export function presentPaddleCheckoutLines(
  lines: PaddleCheckoutLine[],
  catalog: PaddlePriceCatalog,
): PaddleCheckoutLinePresentation[] {
  return lines.map((line) => {
    const role = resolvePriceRoleInCatalog(catalog, line.priceId)
    return {
      priceId: line.priceId,
      quantity: line.quantity,
      productRole: role?.productRole ?? "individual",
      interval: role?.interval ?? "monthly",
      priceIdSuffix: line.priceId.slice(-8),
    }
  })
}
