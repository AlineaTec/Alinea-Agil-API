import type {
  BillingCadence,
  CommercialPlanKind,
  CommercialPlanTier,
} from "./commercial-pricing.constants.js"
import {
  ADDITIONAL_SEAT_MONTHLY_USD,
  COMMERCIAL_CURRENCY,
  FREE_TIER_MAX_SEATS,
  INDIVIDUAL_MONTHLY_USD,
  PAID_TIER_MIN_LICENSES,
  PRO_TIER_LICENSE_MONTHLY_USD,
  TEAM_BASE_MONTHLY_USD,
  TEAM_MIN_SEATS,
  TEAM_TIER_LICENSE_MONTHLY_USD,
} from "./commercial-pricing.constants.js"

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

/** Asientos facturables Team tras aplicar mínimo (modelo legado o tier de pago). */
export function effectiveTeamSeatsPurchased(requestedSeats: number): number {
  const n = Math.floor(Number(requestedSeats))
  if (!Number.isFinite(n)) return TEAM_MIN_SEATS
  return Math.max(TEAM_MIN_SEATS, n)
}

function effectivePaidTierSeats(requestedSeats: number | undefined): number {
  const n = Math.floor(Number(requestedSeats))
  if (!Number.isFinite(n)) return PAID_TIER_MIN_LICENSES
  return Math.max(PAID_TIER_MIN_LICENSES, n)
}

export function monthlyListPriceUsd(plan: CommercialPlanKind, seatsBilled: number): number {
  if (plan === "individual") return INDIVIDUAL_MONTHLY_USD
  const additionalSeats = Math.max(0, seatsBilled - TEAM_MIN_SEATS)
  return roundMoney(TEAM_BASE_MONTHLY_USD + additionalSeats * ADDITIONAL_SEAT_MONTHLY_USD)
}

function monthlyListForPlanTier(
  planTier: CommercialPlanTier,
  seatsBilled: number,
): number {
  if (planTier === "free") return 0
  const perLicense =
    planTier === "pro" ? PRO_TIER_LICENSE_MONTHLY_USD : TEAM_TIER_LICENSE_MONTHLY_USD
  return roundMoney(perLicense * seatsBilled)
}

export type CommercialQuote = {
  currency: typeof COMMERCIAL_CURRENCY
  plan: CommercialPlanKind
  /** Tier comercial cuando el registro usa Gratis / Equipo / Pro. */
  planTier?: CommercialPlanTier
  billingCadence: BillingCadence
  seatsBilled: number
  /** Precio de lista por mes (antes de prorratear anual). */
  monthlyListUsd: number
  /** Meses facturados en este cobro (1 o 12). */
  periodMonths: number
  /** Subtotal lista antes de descuento (monthlyList × periodMonths). */
  subtotalListUsd: number
  annualDiscountRate: number
  discountUsd: number
  totalDueUsd: number
  /** Total / meses del periodo (útil para UI). */
  equivalentMonthlyUsd: number
}

export function computeCommercialQuote(input: {
  plan: CommercialPlanKind
  billingCadence: BillingCadence
  /** Solo Team; se ignora en Individual. */
  teamSeatsRequested?: number
  /** Cuando viene del registro con catálogo Gratis / Equipo / Pro. */
  planTier?: CommercialPlanTier
}): CommercialQuote {
  const planTier = input.planTier

  let seatsBilled: number
  let monthlyListUsd: number
  let plan = input.plan

  if (planTier === "free") {
    seatsBilled = FREE_TIER_MAX_SEATS
    monthlyListUsd = 0
    plan = "individual"
  } else if (planTier === "team" || planTier === "pro") {
    seatsBilled = effectivePaidTierSeats(input.teamSeatsRequested)
    monthlyListUsd = monthlyListForPlanTier(planTier, seatsBilled)
    plan = "team"
  } else {
    seatsBilled =
      input.plan === "individual"
        ? 1
        : effectiveTeamSeatsPurchased(input.teamSeatsRequested ?? TEAM_MIN_SEATS)
    monthlyListUsd = monthlyListPriceUsd(input.plan, seatsBilled)
  }

  const periodMonths = 1
  const subtotalListUsd = roundMoney(monthlyListUsd * periodMonths)
  const annualDiscountRate = 0
  const discountUsd = 0
  const totalDueUsd = roundMoney(subtotalListUsd - discountUsd)
  const equivalentMonthlyUsd = roundMoney(totalDueUsd / periodMonths)

  return {
    currency: COMMERCIAL_CURRENCY,
    plan,
    ...(planTier !== undefined ? { planTier } : {}),
    billingCadence: "monthly",
    seatsBilled,
    monthlyListUsd,
    periodMonths,
    subtotalListUsd,
    annualDiscountRate,
    discountUsd,
    totalDueUsd,
    equivalentMonthlyUsd,
  }
}

export function seatsForNewWorkspaceFromIntent(input: {
  modality: CommercialPlanKind
  teamSeatsPurchased?: number
  planTier?: CommercialPlanTier
}): number {
  if (input.planTier === "free") return FREE_TIER_MAX_SEATS
  if (input.planTier === "team" || input.planTier === "pro") {
    return effectivePaidTierSeats(input.teamSeatsPurchased)
  }
  if (input.modality === "individual") return 1
  return effectiveTeamSeatsPurchased(input.teamSeatsPurchased ?? TEAM_MIN_SEATS)
}
