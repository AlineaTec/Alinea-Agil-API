import type { PlatformAuditAction } from "../../domain/platform-audit-action.js"
import type { PlatformRole } from "../../domain/platform-role.js"

export interface PlatformAuditEventDocProps {
  platformAuditEventId: string
  occurredAt: Date
  actorPlatformUserId: string
  actorRole: PlatformRole
  action: PlatformAuditAction
  targetPlatformUserId: string | null
  targetPlatformTenantId: string | null
  /** Contexto tenant/workspace cuando aplica (p. ej. eventos `tenant.*`). */
  workspacePublicId?: string | null
  summary: string
  payloadBefore: unknown
  payloadAfter: unknown
}
