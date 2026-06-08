/**
 * Estados de salud compartidos entre `platform-tenants` y `platform-observability` (sin score numérico).
 */
export const PLATFORM_HEALTH_STATUSES = ["normal", "warning", "no_data"] as const

export type PlatformHealthStatus = (typeof PLATFORM_HEALTH_STATUSES)[number]
