import type { WorkspaceAuditLogCategory } from "./workspace-audit-log-entry.js"

export type WorkspaceAuditLogListRow = {
  auditEventPublicId: string
  workspacePublicId: string
  category: WorkspaceAuditLogCategory
  action: string
  occurredAt: Date
  resourceProjectPublicId: string
  resourceBacklogItemPublicId: string | null
  previousValue: unknown | null
  nextValue: unknown
}

export type WorkspaceAuditLogListForProjectInput = {
  workspacePublicId: string
  projectPublicId: string
  categories?: WorkspaceAuditLogCategory[]
  actions?: string[]
  occurredAtFrom?: Date
  occurredAtTo?: Date
}
