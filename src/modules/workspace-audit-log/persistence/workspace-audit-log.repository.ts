import type { WorkspaceAuditLogAppendInput, WorkspaceAuditLogCategory } from "../domain/workspace-audit-log-entry.js"
import type {
  WorkspaceAuditLogListForProjectInput,
  WorkspaceAuditLogListRow,
} from "../domain/workspace-audit-log-list-row.js"

export type WorkspaceAuditLogCountForProjectUserInput = {
  workspacePublicId: string
  projectPublicId: string
  actorUserPublicId: string
  occurredAtFrom: Date
  occurredAtTo: Date
  categories: WorkspaceAuditLogCategory[]
}

export interface WorkspaceAuditLogRepository {
  append(input: WorkspaceAuditLogAppendInput): Promise<void>
  /** Lectura para agregados (p. ej. métricas Kanban). Orden ascendente por `occurredAt`. */
  listForProject(input: WorkspaceAuditLogListForProjectInput): Promise<WorkspaceAuditLogListRow[]>
  /** Conteo de eventos relevantes para contexto de trabajo (p. ej. Alineamiento Diario v1). */
  countForProjectUserInWindow(input: WorkspaceAuditLogCountForProjectUserInput): Promise<number>
}
