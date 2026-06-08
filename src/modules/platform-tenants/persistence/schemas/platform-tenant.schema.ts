import type { PlatformTenantStatus } from "../../domain/platform-tenant-status.js"

export interface PlatformTenantDocProps {
  platformTenantId: string
  workspacePublicId: string
  status: PlatformTenantStatus
}
