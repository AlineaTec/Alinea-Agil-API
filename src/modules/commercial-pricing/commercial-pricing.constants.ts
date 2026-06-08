/**
 * Fuente de verdad de precios comerciales (USD, sin impuestos).
 *
 * Team: precio **base** (3 usuarios) + **Seat adicional** por usuario >3.
 * Descuento anual por defecto **10%** sobre el subtotal del periodo (12× lista mensual).
 * Opcional: `COMMERCIAL_ANNUAL_DISCOUNT_RATE` (decimal, máximo `ANNUAL_DISCOUNT_RATE_CAP`). Ver README.
 */
export const COMMERCIAL_CURRENCY = "USD" as const

/** Plan Individual: precio fijo mensual. */
export const INDIVIDUAL_MONTHLY_USD = 12

/** Team: bloque base (incluye 3 usuarios). */
export const TEAM_BASE_MONTHLY_USD = 45

/** Team: seat adicional (por cada usuario por encima de 3). */
export const ADDITIONAL_SEAT_MONTHLY_USD = 15

/**
 * @deprecated Usar `ADDITIONAL_SEAT_MONTHLY_USD`. Mismo valor (15); nombre legacy del modelo “por asiento único”.
 */
export const TEAM_SEAT_MONTHLY_USD = ADDITIONAL_SEAT_MONTHLY_USD

/** Mínimo de asientos facturables en Team (3 usuarios en base). */
export const TEAM_MIN_SEATS = 3

export const ANNUAL_DISCOUNT_RATE_DEFAULT = 0.1
export const ANNUAL_DISCOUNT_RATE_CAP = 0.2

export type BillingCadence = "monthly" | "annual"

export type CommercialPlanKind = "individual" | "team"

/** Plan comercial de presentación (Gratis / Equipo / Pro). */
export type CommercialPlanTier = "free" | "team" | "pro"

/** Usuarios incluidos en plan Gratis al activar workspace. */
export const FREE_TIER_MAX_SEATS = 3

/** Precio por licencia/mes (USD) — Equipo. */
export const TEAM_TIER_LICENSE_MONTHLY_USD = 7.99

/** Precio por licencia/mes (USD) — Pro. */
export const PRO_TIER_LICENSE_MONTHLY_USD = 14.99

/** Mínimo de licencias en planes de pago. */
export const PAID_TIER_MIN_LICENSES = 3

export const COMMERCIAL_PLAN_TIERS = ["free", "team", "pro"] as const satisfies readonly CommercialPlanTier[]

export function planTierFromPlanSku(planSku: string | undefined): CommercialPlanTier | undefined {
  if (planSku === "free" || planSku === "team" || planSku === "pro") return planSku
  return undefined
}
