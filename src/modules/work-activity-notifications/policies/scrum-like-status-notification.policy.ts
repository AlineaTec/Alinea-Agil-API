import type { ScrumBacklogItemStatus } from "../../project-scrum-backlog/domain/backlog-item-status.js"
import type { WorkActivityNotificationEventType } from "../domain/work-activity-notification-event-type.js"

export function classifyScrumLikeStatusChange(
  previousStatus: ScrumBacklogItemStatus,
  nextStatus: ScrumBacklogItemStatus,
): WorkActivityNotificationEventType | null {
  if (previousStatus === nextStatus) return null
  if (previousStatus !== "done" && nextStatus === "done") return "CLOSED"
  if (previousStatus === "done" && nextStatus !== "done") return "REOPENED"
  return "STATUS_CHANGED"
}
