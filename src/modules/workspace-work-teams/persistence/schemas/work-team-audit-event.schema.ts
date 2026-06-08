import type { WorkTeamAuditAction } from "../../domain/work-team-audit-action.js"

export interface WorkTeamAuditEventDocProps  {
  auditEventPublicId: string
  workspacePublicId: string
  teamPublicId: string
  action: WorkTeamAuditAction
  actorUserPublicId: string
  occurredAt: Date
  payloadBefore: unknown
  payloadAfter: unknown
}
