import type { WorkActivityNotificationEventType } from "./work-activity-notification-event-type.js"

export type WorkActivityNotificationResourceAvailability = "available" | "unavailable"

export type WorkActivityNotificationNavigationTarget =
  | {
      kind: "scrum_backlog_item"
      projectPublicId: string
      workItemPublicId: string
      sprintPublicId: string | null
      boardColumnPublicId: string | null
    }
  | {
      kind: "guided_retro_action"
      projectPublicId: string
      actionItemPublicId: string
    }

export type WorkActivityNotificationState = {
  notificationPublicId: string
  workspacePublicId: string
  recipientUserPublicId: string
  eventType: WorkActivityNotificationEventType
  eventCategory: "work_activity"
  sourceEntityType: "backlog_item" | "work_item_comment" | "guided_retro_action_item"
  sourceEntityPublicId: string
  projectPublicId: string
  sprintPublicId: string | null
  boardColumnPublicId: string | null
  title: string
  summary: string
  actorUserPublicId: string | null
  actorDisplayName: string | null
  triggeredAt: Date
  readAt: Date | null
  isRead: boolean
  isResponsibilityRelated: boolean
  isFollowingRelated: boolean
  navigationTarget: WorkActivityNotificationNavigationTarget
  groupingKey: string | null
  dedupeKey: string
  resourceAvailability: WorkActivityNotificationResourceAvailability
  retentionExpiresAt: Date
}

export type WorkActivityNotificationListScope = "all" | "mine" | "following" | "unread"
