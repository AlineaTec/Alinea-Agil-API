import type { BillingNotificationKind } from "../domain/billing-notification-kind.js"

export interface BillingNotificationSentRepository {
  /**
   * Inserta registro de envío si no existe `(workspace, kind, dedupeKey)`.
   * @returns true si esta corrida es la primera (debe enviar).
   */
  tryClaim(workspacePublicId: string, kind: BillingNotificationKind, dedupeKey: string): Promise<boolean>
  /** Historial reciente para Billing Operations (solo lectura). */
  listRecentByWorkspacePublicId(
    workspacePublicId: string,
    limit: number,
  ): Promise<Array<{ kind: BillingNotificationKind; dedupeKey: string; sentAt: Date }>>
  /** Última notificación por workspace entre un conjunto de IDs (una por workspace). */
  findLatestPerWorkspaceIds(
    workspacePublicIds: string[],
  ): Promise<Map<string, { kind: BillingNotificationKind; dedupeKey: string; sentAt: Date }>>
}
