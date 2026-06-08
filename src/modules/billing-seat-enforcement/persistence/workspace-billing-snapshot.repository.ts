import type { PersistenceSession as ClientSession } from "../../../infrastructure/persistence/persistence-session.js"

import type { WorkspaceBillingSnapshotProps } from "../domain/workspace-billing-snapshot.js"

export interface WorkspaceBillingSnapshotRepository {
  findByWorkspacePublicId(
    workspacePublicId: string,
    session?: ClientSession,
  ): Promise<WorkspaceBillingSnapshotProps | null>
  findBySubscriptionExternalId(
    subscriptionExternalId: string,
    session?: ClientSession,
  ): Promise<WorkspaceBillingSnapshotProps | null>
  replace(row: WorkspaceBillingSnapshotProps, session?: ClientSession): Promise<void>
  insertInitial(row: WorkspaceBillingSnapshotProps, session?: ClientSession): Promise<void>
  /** Workspaces `billingSource=paddle` con `subscriptionExternalId` para jobs de reconciliación ligera. */
  findPaddleLinkedWorkspacePublicIds(limit: number): Promise<string[]>
  /**
   * Gracia activa con fin de período en `(now, now + lookahead]` — últimos días antes del fin de gracia.
   */
  findGraceSnapshotsEndingWithin(now: Date, lookaheadMs: number, session?: ClientSession): Promise<WorkspaceBillingSnapshotProps[]>
  /**
   * Gracia vencida (`gracePeriodEndsAt <= now`) y estados que aún pueden escalar a suspensión por impago.
   */
  findSnapshotsWithGraceExpiredBefore(now: Date, session?: ClientSession): Promise<WorkspaceBillingSnapshotProps[]>
  /** Listado administrativo plataforma (Billing Operations). */
  countForPlatformFilter(filter: WorkspaceBillingSnapshotPlatformFilter): Promise<number>
  findForPlatformFilter(
    filter: WorkspaceBillingSnapshotPlatformFilter,
    opts: { skip: number; limit: number },
    session?: ClientSession,
  ): Promise<WorkspaceBillingSnapshotProps[]>
}

import type { BillingSource, WorkspaceBillingStatus } from "../domain/workspace-billing-status.js"

export type WorkspaceBillingSnapshotPlatformFilter = {
  workspacePublicIds?: string[]
  billingSource?: BillingSource
  billingStatusIn?: WorkspaceBillingStatus[]
}
