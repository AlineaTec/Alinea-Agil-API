/**
 * Rutas relativas de API admin bajo `/v1/platform` (mismo host).
 * Deep links y respuestas JSON sin duplicar strings.
 */

export function platformAdminLicensingTenantPath(platformTenantId: string): string {
  const base = process.env.PLATFORM_ADMIN_LICENSING_BASE_PATH?.trim() || "/v1/platform/licensing"
  return `${base.replace(/\/$/, "")}/tenants/${platformTenantId}`
}

export function platformAdminTenantDetailPath(platformTenantId: string): string {
  return `/v1/platform/tenants/${platformTenantId}`
}

export function platformAdminTenantByWorkspacePath(workspacePublicId: string): string {
  return `/v1/platform/tenants/by-workspace/${workspacePublicId}`
}

export function platformAdminObservabilityTenantPath(platformTenantId: string): string {
  return `/v1/platform/observability/tenants/${platformTenantId}`
}

export function platformAdminAuditEventsListPath(): string {
  return "/v1/platform/audit/events"
}
