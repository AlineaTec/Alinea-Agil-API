import type { WorkTeamAuditAction } from "../domain/work-team-audit-action.js"

export type WorkTeamAuditAppendInput = {
  workspacePublicId: string
  teamPublicId: string
  action: WorkTeamAuditAction
  actorUserPublicId: string
  occurredAt: Date
  payloadBefore: unknown
  payloadAfter: unknown
}

export type WorkTeamAuditListRow = {
  auditEventPublicId: string
  teamPublicId: string
  action: WorkTeamAuditAction
  actorUserPublicId: string
  occurredAt: Date
  payloadBefore: unknown
  payloadAfter: unknown
}

export interface WorkTeamAuditRepository {
  append(input: WorkTeamAuditAppendInput): Promise<void>
  listByTeam(
    workspacePublicId: string,
    teamPublicId: string,
    options: { limit: number; offset: number },
  ): Promise<{ items: WorkTeamAuditListRow[]; totalCount: number }>
}
