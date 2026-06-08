import type { BillingAuditEventType } from "../domain/workspace-billing-snapshot.js"

export interface WorkspaceBillingAuditRepository {
  append(
    workspacePublicId: string,
    eventType: BillingAuditEventType,
    payload: Record<string, unknown>,
  ): Promise<void>
  /** Eventos recientes para Billing Operations (descendente por tiempo). */
  listRecentByWorkspacePublicId(workspacePublicId: string, limit: number): Promise<
    Array<{ eventType: string; payload: Record<string, unknown>; createdAt: Date }>
  >
  /**
   * Último evento de atención por workspace entre tipos conocidos (p. ej. divergencia / conflicto reconcile).
   */
  findLatestAttentionEventsByWorkspaceIds(
    workspacePublicIds: string[],
    eventTypes: readonly string[],
  ): Promise<Map<string, { eventType: string; createdAt: Date }>>
}
