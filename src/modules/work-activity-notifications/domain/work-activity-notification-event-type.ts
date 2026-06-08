export const WORK_ACTIVITY_NOTIFICATION_EVENT_TYPES = [
  "ASSIGNED",
  "UNASSIGNED",
  "STATUS_CHANGED",
  "KANBAN_COLUMN_MOVED",
  "BLOCKED",
  "UNBLOCKED",
  "COMMENT_ADDED",
  "MENTIONED_IN_COMMENT",
  "CLOSED",
  "REOPENED",
  "SPRINT_ADDED",
  "SPRINT_REMOVED",
] as const

export type WorkActivityNotificationEventType = (typeof WORK_ACTIVITY_NOTIFICATION_EVENT_TYPES)[number]

export function isWorkActivityNotificationEventType(v: string): v is WorkActivityNotificationEventType {
  return (WORK_ACTIVITY_NOTIFICATION_EVENT_TYPES as readonly string[]).includes(v)
}
