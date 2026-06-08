import type { WorkActivityNotificationDocProps } from "../schemas/work-activity-notification.schema.js"
import type {
  WorkActivityNotificationNavigationTarget,
  WorkActivityNotificationState,
} from "../../domain/work-activity-notification.types.js"
import { isWorkActivityNotificationEventType } from "../../domain/work-activity-notification-event-type.js"

function asNavigationTarget(raw: Record<string, unknown>): WorkActivityNotificationNavigationTarget {
  const kind = raw.kind
  const projectPublicId = raw.projectPublicId
  if (kind === "guided_retro_action") {
    const actionItemPublicId = raw.actionItemPublicId
    if (typeof projectPublicId !== "string" || typeof actionItemPublicId !== "string") {
      throw new Error("invalid_navigation_target_payload")
    }
    return {
      kind: "guided_retro_action",
      projectPublicId,
      actionItemPublicId,
    }
  }
  const workItemPublicId = raw.workItemPublicId
  if (kind !== "scrum_backlog_item") {
    throw new Error("unsupported_navigation_kind_in_notification")
  }
  if (typeof projectPublicId !== "string" || typeof workItemPublicId !== "string") {
    throw new Error("invalid_navigation_target_payload")
  }
  return {
    kind: "scrum_backlog_item",
    projectPublicId,
    workItemPublicId,
    sprintPublicId: typeof raw.sprintPublicId === "string" ? raw.sprintPublicId : null,
    boardColumnPublicId: typeof raw.boardColumnPublicId === "string" ? raw.boardColumnPublicId : null,
  }
}

export function docToNotificationState(doc: WorkActivityNotificationDocProps): WorkActivityNotificationState {
  if (!isWorkActivityNotificationEventType(doc.eventType)) {
    throw new Error("invalid_notification_event_type_in_db")
  }
  return {
    notificationPublicId: doc.notificationPublicId,
    workspacePublicId: doc.workspacePublicId,
    recipientUserPublicId: doc.recipientUserPublicId,
    eventType: doc.eventType,
    eventCategory: doc.eventCategory,
    sourceEntityType: doc.sourceEntityType,
    sourceEntityPublicId: doc.sourceEntityPublicId,
    projectPublicId: doc.projectPublicId,
    sprintPublicId: doc.sprintPublicId ?? null,
    boardColumnPublicId: doc.boardColumnPublicId ?? null,
    title: doc.title,
    summary: doc.summary,
    actorUserPublicId: doc.actorUserPublicId ?? null,
    actorDisplayName: doc.actorDisplayName ?? null,
    triggeredAt: doc.triggeredAt,
    readAt: doc.readAt ?? null,
    isRead: doc.isRead === true,
    isResponsibilityRelated: doc.isResponsibilityRelated === true,
    isFollowingRelated: doc.isFollowingRelated === true,
    navigationTarget: asNavigationTarget(doc.navigationTarget as Record<string, unknown>),
    groupingKey: doc.groupingKey ?? null,
    dedupeKey: doc.dedupeKey,
    resourceAvailability: doc.resourceAvailability,
    retentionExpiresAt: doc.retentionExpiresAt,
  }
}

export function stateToDoc(state: WorkActivityNotificationState): WorkActivityNotificationDocProps {
  return {
    notificationPublicId: state.notificationPublicId,
    workspacePublicId: state.workspacePublicId,
    recipientUserPublicId: state.recipientUserPublicId,
    eventType: state.eventType,
    eventCategory: state.eventCategory,
    sourceEntityType: state.sourceEntityType,
    sourceEntityPublicId: state.sourceEntityPublicId,
    projectPublicId: state.projectPublicId,
    sprintPublicId: state.sprintPublicId,
    boardColumnPublicId: state.boardColumnPublicId,
    title: state.title,
    summary: state.summary,
    actorUserPublicId: state.actorUserPublicId,
    actorDisplayName: state.actorDisplayName,
    triggeredAt: state.triggeredAt,
    readAt: state.readAt,
    isRead: state.isRead,
    isResponsibilityRelated: state.isResponsibilityRelated,
    isFollowingRelated: state.isFollowingRelated,
    navigationTarget: { ...state.navigationTarget },
    groupingKey: state.groupingKey,
    dedupeKey: state.dedupeKey,
    resourceAvailability: state.resourceAvailability,
    retentionExpiresAt: state.retentionExpiresAt,
  }
}
