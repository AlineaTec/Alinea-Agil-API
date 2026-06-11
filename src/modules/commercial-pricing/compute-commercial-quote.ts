import type {
  BillingCadence,
  CommercialPlanKind,
  CommercialPlanTier,
} from "./commercial-pricing.constants.js"
import {
  ADDITIONAL_SEAT_MONTHLY_USD,
  COMMERCIAL_CURRENCY,
  GRATIS_TIER_MAX_SEATS,
  INDIVIDUAL_MONTHLY_USD,
  LEGACY_TEAM_MIN_SEATS,
  PAID_TIER_MIN_LICENSES,
  ESTANDAR_TIER_LICENSE_MONTHLY_USD,
  PROFESIONAL_TIER_LICENSE_MONTHLY_USD,
  TEAM_BASE_MONTHLY_USD,
} from "./commercial-pricing.constants.js"
import { ACTIVE_BILLING_CADENCE } from "./billing-cadence.js"

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

/** Asientos facturables Team en modelo Paddle legado (mín. 3). */
export function effectiveLegacyTeamSeatsPurchased(requestedSeats: number): number {
  const n = Math.floor(Number(requestedSeats))
  if (!Number.isFinite(n)) return LEGACY_TEAM_MIN_SEATS
  return Math.max(LEGACY_TEAM_MIN_SEATS, n)
}

/** @deprecated Alias de `effectiveLegacyTeamSeatsPurchased` (Paddle v1). */
export const effectiveTeamSeatsPurchased = effectiveLegacyTeamSeatsPurchased

/** Licencias en planes de pago Equipo / Pro (mín. 1). */
export function effectivePaidTierSeats(requestedSeats: number | undefined): number {
  const n = Math.floor(Number(requestedSeats))
  if (!Number.isFinite(n)) return PAID_TIER_MIN_LICENSES
  return Math.max(PAID_TIER_MIN_LICENSES, n)
}

export function monthlyListPriceUsd(plan: CommercialPlanKind, seatsBilled: number): number {
  if (plan === "individual") return INDIVIDUAL_MONTHLY_USD
  const additionalSeats = Math.max(0, seatsBilled - LEGACY_TEAM_MIN_SEATS)
  return roundMoney(TEAM_BASE_MONTHLY_USD + additionalSeats * ADDITIONAL_SEAT_MONTHLY_USD)
}

function monthlyListForPlanTier(
  planTier: CommercialPlanTier,
  seatsBilled: number,
): number {
  if (planTier === "gratis") return 0
  const perLicense =
    planTier === "profesional"
      ? PROFESIONAL_TIER_LICENSE_MONTHLY_USD
      : ESTANDAR_TIER_LICENSE_MONTHLY_USD
  return roundMoney(perLicense * seatsBilled)
}

export type CommercialQuote = {
  currency: typeof COMMERCIAL_CURRENCY
  plan: CommercialPlanKind
  /** Tier comercial cuando el registro usa Gratis / Estándar / Profesional. */
  planTier?: CommercialPlanTier
  billingCadence: BillingCadence
  seatsBilled: number
  /** Precio de lista por mes. */
  monthlyListUsd: number
  /** Meses facturados en este cobro (siempre 1). */
  periodMonths: number
  /** Subtotal lista (monthlyList × periodMonths). */
  subtotalListUsd: number
  totalDueUsd: number
  /** Total / meses del periodo (útil para UI). */
  equivalentMonthlyUsd: number
}

export function computeCommercialQuote(input: {
  plan: CommercialPlanKind
  billingCadence: BillingCadence
  /** Solo Team; se ignora en Individual. */
  teamSeatsRequested?: number
  /** Cuando viene del registro con catálogo Gratis / Estándar / Profesional. */
  planTier?: CommercialPlanTier
}): CommercialQuote {
  const planTier = input.planTier

  let seatsBilled: number
  let monthlyListUsd: number
  let plan = input.plan

  if (planTier === "gratis") {
    seatsBilled = GRATIS_TIER_MAX_SEATS
    monthlyListUsd = 0
    plan = "individual"
  } else if (planTier === "estandar" || planTier === "profesional") {
    seatsBilled = effectivePaidTierSeats(input.teamSeatsRequested)
    monthlyListUsd = monthlyListForPlanTier(planTier, seatsBilled)
    plan = "team"
  } else {
    seatsBilled =
      input.plan === "individual"
        ? 1
        : effectiveLegacyTeamSeatsPurchased(input.teamSeatsRequested ?? LEGACY_TEAM_MIN_SEATS)
    monthlyListUsd = monthlyListPriceUsd(input.plan, seatsBilled)
  }

  const periodMonths = 1
  const subtotalListUsd = roundMoney(monthlyListUsd * periodMonths)
  const totalDueUsd = subtotalListUsd
  const equivalentMonthlyUsd = roundMoney(totalDueUsd / periodMonths)

  return {
    currency: COMMERCIAL_CURRENCY,
    plan,
    ...(planTier !== undefined ? { planTier } : {}),
    billingCadence: ACTIVE_BILLING_CADENCE,
    seatsBilled,
    monthlyListUsd,
    periodMonths,
    subtotalListUsd,
    totalDueUsd,
    equivalentMonthlyUsd,
  }
}

export function seatsForNewWorkspaceFromIntent(input: {
  modality: CommercialPlanKind
  teamSeatsPurchased?: number
  planTier?: CommercialPlanTier
}): number {
  if (input.planTier === "gratis") return GRATIS_TIER_MAX_SEATS
  if (input.planTier === "estandar" || input.planTier === "profesional") {
    return effectivePaidTierSeats(input.teamSeatsPurchased)
  }
  if (input.modality === "individual") return 1
  return effectiveLegacyTeamSeatsPurchased(input.teamSeatsPurchased ?? LEGACY_TEAM_MIN_SEATS)
}
