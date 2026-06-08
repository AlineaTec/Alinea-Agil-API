import type { PlatformAuditAction } from "../domain/platform-audit-action.js"
import type { PlatformRole } from "../domain/platform-role.js"

export type PlatformAuditEventRecord = {
  platformAuditEventId: string
  occurredAt: Date
  actorPlatformUserId: string
  actorRole: PlatformRole
  action: PlatformAuditAction
  /** Mutaciones de usuario plataforma; `null` en eventos de tenant. */
  targetPlatformUserId: string | null
  /** Mutaciones de tenant; `null` en eventos de usuario plataforma. */
  targetPlatformTenantId: string | null
  workspacePublicId: string | null
  summary: string
  payloadBefore: unknown
  payloadAfter: unknown
}

export interface PlatformAuditRepository {
  append(record: Omit<PlatformAuditEventRecord, "platformAuditEventId" | "occurredAt">): Promise<void>
}
