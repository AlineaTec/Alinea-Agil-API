import type { CommercialPlanTier } from "./commercial-pricing.constants.js"

export type PlanTierMeta = {
  id: CommercialPlanTier
  pricePerLicenseMonthlyUsd: number | null
  minLicenses: number
  maxUsers: number
  maxActiveProjects: number
}

export const ALINEA_PLAN_TIERS: Record<CommercialPlanTier, PlanTierMeta> = {
  gratis: {
    id: "gratis",
    pricePerLicenseMonthlyUsd: null,
    minLicenses: 1,
    maxUsers: 5,
    maxActiveProjects: 5,
  },
  estandar: {
    id: "estandar",
    pricePerLicenseMonthlyUsd: 6,
    minLicenses: 1,
    maxUsers: 999_999,
    maxActiveProjects: 999_999,
  },
  profesional: {
    id: "profesional",
    pricePerLicenseMonthlyUsd: 12,
    minLicenses: 1,
    maxUsers: 999_999,
    maxActiveProjects: 999_999,
  },
}

export function maxActiveProjectsForPlanTier(planTier: CommercialPlanTier): number {
  return ALINEA_PLAN_TIERS[planTier].maxActiveProjects
}

export function maxUsersForPlanTier(planTier: CommercialPlanTier): number {
  return ALINEA_PLAN_TIERS[planTier].maxUsers
}

export function pricePerLicenseMonthlyUsd(planTier: CommercialPlanTier): number | null {
  return ALINEA_PLAN_TIERS[planTier].pricePerLicenseMonthlyUsd
}
