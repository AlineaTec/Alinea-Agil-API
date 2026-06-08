import type { WorkActivityNotificationState } from "../domain/work-activity-notification.types.js"
import type { WorkActivityNotificationEventType } from "../domain/work-activity-notification-event-type.js"

export type ListNotificationsCursor = {
  triggeredAt: Date
  notificationPublicId: string
}

export type ListNotificationsFilters = {
  recipientUserPublicId: string
  workspacePublicId?: string
  scope: "all" | "mine" | "following" | "unread"
  /** Lower bound for triggeredAt (panel window / retention). */
  minTriggeredAt: Date
  /** Upper bound for triggeredAt (typically `now`). */
  maxTriggeredAt: Date
  limit: number
  after: ListNotificationsCursor | null
}

export interface WorkActivityNotificationRepository {
  insert(state: WorkActivityNotificationState): Promise<void>
  findByPublicIdAndRecipient(
    notificationPublicId: string,
    recipientUserPublicId: string,
  ): Promise<WorkActivityNotificationState | null>
  findRecentBurstMergeCandidate(input: {
    recipientUserPublicId: string
    workspacePublicId: string
    backlogItemPublicId: string
    actorUserPublicId: string | null
    eventTypes: WorkActivityNotificationEventType[]
    since: Date
  }): Promise<WorkActivityNotificationState | null>
  applyBurstMerge(input: {
    notificationPublicId: string
    recipientUserPublicId: string
    patch: {
      triggeredAt: Date
      title: string
      summary: string
      groupingKey: string | null
      dedupeKey: string
    }
  }): Promise<boolean>
  listForRecipient(filters: ListNotificationsFilters): Promise<WorkActivityNotificationState[]>
  countUnreadForRecipient(input: {
    recipientUserPublicId: string
    workspacePublicId?: string
    minTriggeredAt: Date
    maxTriggeredAt: Date
  }): Promise<number>
  markRead(notificationPublicId: string, recipientUserPublicId: string, at: Date): Promise<boolean>
  markAllRead(input: {
    recipientUserPublicId: string
    workspacePublicId?: string
    minTriggeredAt: Date
    maxTriggeredAt: Date
    at: Date
  }): Promise<number>
}
