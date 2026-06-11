import {
  ALINEA_PLAN_TIERS,
  maxActiveProjectsForPlanTier,
  maxUsersForPlanTier,
  pricePerLicenseMonthlyUsd,
} from "./alinea-plan-catalog.js"
import type { ActiveBillingCadence } from "./billing-cadence.js"

/**
 * Fuente de verdad de precios comerciales (USD, sin impuestos).
 *
 * Modelo vigente: tiers **Gratis / Estándar / Profesional** (ver `alinea-plan-catalog.ts`).
 * Constantes `LEGACY_*` y `INDIVIDUAL_*` / `TEAM_BASE_*` se conservan solo para
 * suscripciones Paddle históricas (base 3 + addon).
 */
export const COMMERCIAL_CURRENCY = "USD" as const

/** @deprecated Modelo Paddle legado — plan Individual fijo. */
export const INDIVIDUAL_MONTHLY_USD = 12

/** @deprecated Modelo Paddle legado — Team base (3 usuarios). */
export const TEAM_BASE_MONTHLY_USD = 45

/** @deprecated Modelo Paddle legado — seat adicional (>3 usuarios). */
export const ADDITIONAL_SEAT_MONTHLY_USD = 15

/**
 * @deprecated Usar `ADDITIONAL_SEAT_MONTHLY_USD`. Mismo valor (15); nombre legacy.
 */
export const TEAM_SEAT_MONTHLY_USD = ADDITIONAL_SEAT_MONTHLY_USD

/** @deprecated Mínimo de asientos en modelo Paddle legado (base 3 usuarios). */
export const LEGACY_TEAM_MIN_SEATS = 3

/** Alias legacy usado por integración Paddle v1. */
export const TEAM_MIN_SEATS = LEGACY_TEAM_MIN_SEATS

export type BillingCadence = ActiveBillingCadence

export type CommercialPlanKind = "individual" | "team"

/** Plan comercial de presentación (Gratis / Estándar / Profesional). */
export type CommercialPlanTier = "gratis" | "estandar" | "profesional"

/** Usuarios incluidos al activar plan Gratis. */
export const GRATIS_TIER_MAX_SEATS = ALINEA_PLAN_TIERS.gratis.maxUsers

/** Proyectos activos máximos en plan Gratis. */
export const GRATIS_TIER_MAX_ACTIVE_PROJECTS = ALINEA_PLAN_TIERS.gratis.maxActiveProjects

/** Precio por licencia/mes (USD) — Estándar. */
export const ESTANDAR_TIER_LICENSE_MONTHLY_USD = ALINEA_PLAN_TIERS.estandar.pricePerLicenseMonthlyUsd!

/** Precio por licencia/mes (USD) — Profesional. */
export const PROFESIONAL_TIER_LICENSE_MONTHLY_USD = ALINEA_PLAN_TIERS.profesional.pricePerLicenseMonthlyUsd!

/** Mínimo de licencias en planes de pago (Estándar / Profesional). */
export const PAID_TIER_MIN_LICENSES = ALINEA_PLAN_TIERS.estandar.minLicenses

export const COMMERCIAL_PLAN_TIERS = ["gratis", "estandar", "profesional"] as const satisfies readonly CommercialPlanTier[]

const LEGACY_PLAN_SKU_TO_TIER: Record<string, CommercialPlanTier> = {
  free: "gratis",
  team: "estandar",
  pro: "profesional",
}

export function planTierFromPlanSku(planSku: string | undefined): CommercialPlanTier | undefined {
  if (!planSku) return undefined
  if (planSku === "gratis" || planSku === "estandar" || planSku === "profesional") return planSku
  return LEGACY_PLAN_SKU_TO_TIER[planSku]
}

export {
  ALINEA_PLAN_TIERS,
  maxActiveProjectsForPlanTier,
  maxUsersForPlanTier,
  pricePerLicenseMonthlyUsd,
}
