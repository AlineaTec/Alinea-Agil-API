export const PLATFORM_TENANT_STATUSES = ["active", "suspended"] as const

export type PlatformTenantStatus = (typeof PLATFORM_TENANT_STATUSES)[number]

