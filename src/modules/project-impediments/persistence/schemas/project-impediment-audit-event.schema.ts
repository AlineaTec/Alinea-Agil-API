import type { ImpedimentAuditAction } from "../../domain/impediment-audit-action.js"

export interface ProjectImpedimentAuditEventDocProps {
  auditEventPublicId: string
  workspacePublicId: string
  projectPublicId: string
  impedimentPublicId: string
  action: ImpedimentAuditAction
  actorUserPublicId: string
  occurredAt: Date
  payloadBefore: unknown
  payloadAfter: unknown
}
