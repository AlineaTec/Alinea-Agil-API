import type { PlatformAuditAction } from "../../platform-users/domain/platform-audit-action.js"
import type { PlatformRole } from "../../platform-users/domain/platform-role.js"
import type { PlatformAuditCategory } from "../domain/platform-audit-category.js"

export type PlatformAuditListFilters = {
  platformTenantId?: string
  workspacePublicId?: string
  actorPlatformUserId?: string
  category?: PlatformAuditCategory
  action?: PlatformAuditAction
  fromInclusive: Date
  toInclusive: Date
}

export type PlatformAuditEventRow = {
  platformAuditEventId: string
  occurredAt: Date
  actorPlatformUserId: string
  actorRole: PlatformRole
  action: PlatformAuditAction
  targetPlatformUserId: string | null
  targetPlatformTenantId: string | null
  workspacePublicId: string | null
  summary: string
  payloadBefore: unknown
  payloadAfter: unknown
}

export interface PlatformAuditQueryRepository {
  list(
    filters: PlatformAuditListFilters,
    opts: { limit: number; offset: number },
  ): Promise<PlatformAuditEventRow[]>
  count(filters: PlatformAuditListFilters): Promise<number>
  findById(platformAuditEventId: string): Promise<PlatformAuditEventRow | null>
}
