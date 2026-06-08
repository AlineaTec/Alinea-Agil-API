import type { ImpedimentAuditAction } from "../domain/impediment-audit-action.js"

export type ImpedimentAuditAppendInput = {
  impedimentPublicId: string
  workspacePublicId: string
  projectPublicId: string
  action: ImpedimentAuditAction
  actorUserPublicId: string
  occurredAt: Date
  payloadBefore: unknown
  payloadAfter: unknown
}

export interface ImpedimentAuditRepository {
  append(input: ImpedimentAuditAppendInput): Promise<void>
}
