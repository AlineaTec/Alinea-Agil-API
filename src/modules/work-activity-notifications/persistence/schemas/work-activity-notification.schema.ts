import type { WorkActivityNotificationEventType } from "../../domain/work-activity-notification-event-type.js"
import type { WorkActivityNotificationResourceAvailability } from "../../domain/work-activity-notification.types.js"

export interface WorkActivityNotificationDocProps {
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
  navigationTarget: Record<string, unknown>
  groupingKey: string | null
  dedupeKey: string
  resourceAvailability: WorkActivityNotificationResourceAvailability
  retentionExpiresAt: Date
}
