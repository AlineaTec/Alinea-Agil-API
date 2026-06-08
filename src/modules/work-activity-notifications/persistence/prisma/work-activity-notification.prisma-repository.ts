import type { Prisma, PrismaClient } from "@prisma/client"
import { resolveProjectId } from "../../../../infrastructure/postgres/project-scope.js"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { WorkActivityNotificationState } from "../../domain/work-activity-notification.types.js"
import type { WorkActivityNotificationEventType } from "../../domain/work-activity-notification-event-type.js"
import {
  docToNotificationState,
  stateToDoc,
} from "../mappers/work-activity-notification.mapper.js"
import type {
  ListNotificationsFilters,
  WorkActivityNotificationRepository,
} from "../work-activity-notification.repository.js"
import type { WorkActivityNotification } from "@prisma/client"

function rowToState(row: WorkActivityNotification): WorkActivityNotificationState {
  return docToNotificationState({
    notificationPublicId: row.public_id,
    workspacePublicId: row.workspace_public_id,
    recipientUserPublicId: row.recipient_user_public_id,
    eventType: row.event_type as WorkActivityNotificationEventType,
    eventCategory: row.event_category as "work_activity",
    sourceEntityType: row.source_entity_type as WorkActivityNotificationState["sourceEntityType"],
    sourceEntityPublicId: row.source_entity_public_id,
    projectPublicId: row.project_public_id,
    sprintPublicId: row.sprint_public_id,
    boardColumnPublicId: row.board_column_public_id,
    title: row.title,
    summary: row.summary,
    actorUserPublicId: row.actor_user_public_id,
    actorDisplayName: row.actor_display_name,
    triggeredAt: row.triggered_at,
    readAt: row.read_at,
    isRead: row.is_read,
    isResponsibilityRelated: row.is_responsibility_related,
    isFollowingRelated: row.is_following_related,
    navigationTarget: row.navigation_target as Record<string, unknown>,
    groupingKey: row.grouping_key,
    dedupeKey: row.dedupe_key,
    resourceAvailability: row.resource_availability as WorkActivityNotificationState["resourceAvailability"],
    retentionExpiresAt: row.retention_expires_at,
  })
}

/** PostgreSQL para `work_activity_notifications`. en runtime. */
export class WorkActivityNotificationPrismaRepository implements WorkActivityNotificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async insert(state: WorkActivityNotificationState): Promise<void> {
    const workspaceId = await resolveWorkspaceId(this.prisma, state.workspacePublicId)
    const projectId = await resolveProjectId(
      this.prisma,
      state.workspacePublicId,
      state.projectPublicId,
    )
    if (!workspaceId || !projectId) throw new Error("work_activity_notification_insert_context_not_found")
    const doc = stateToDoc(state)
    await this.prisma.workActivityNotification.create({
      data: {
        public_id: doc.notificationPublicId,
        workspace_id: workspaceId,
        workspace_public_id: doc.workspacePublicId,
        recipient_user_public_id: doc.recipientUserPublicId,
        event_type: doc.eventType,
        event_category: doc.eventCategory,
        source_entity_type: doc.sourceEntityType,
        source_entity_public_id: doc.sourceEntityPublicId,
        project_id: projectId,
        project_public_id: doc.projectPublicId,
        sprint_public_id: doc.sprintPublicId,
        board_column_public_id: doc.boardColumnPublicId,
        title: doc.title,
        summary: doc.summary,
        actor_user_public_id: doc.actorUserPublicId,
        actor_display_name: doc.actorDisplayName,
        triggered_at: doc.triggeredAt,
        read_at: doc.readAt,
        is_read: doc.isRead,
        is_responsibility_related: doc.isResponsibilityRelated,
        is_following_related: doc.isFollowingRelated,
        navigation_target: doc.navigationTarget as Prisma.InputJsonValue,
        grouping_key: doc.groupingKey,
        dedupe_key: doc.dedupeKey,
        resource_availability: doc.resourceAvailability,
        retention_expires_at: doc.retentionExpiresAt,
      },
    })
  }

  async findByPublicIdAndRecipient(
    notificationPublicId: string,
    recipientUserPublicId: string,
  ): Promise<WorkActivityNotificationState | null> {
    const row = await this.prisma.workActivityNotification.findFirst({
      where: { public_id: notificationPublicId, recipient_user_public_id: recipientUserPublicId },
    })
    return row ? rowToState(row) : null
  }

  async findRecentBurstMergeCandidate(input: {
    recipientUserPublicId: string
    workspacePublicId: string
    backlogItemPublicId: string
    actorUserPublicId: string | null
    eventTypes: WorkActivityNotificationEventType[]
    since: Date
  }): Promise<WorkActivityNotificationState | null> {
    const row = await this.prisma.workActivityNotification.findFirst({
      where: {
        recipient_user_public_id: input.recipientUserPublicId,
        workspace_public_id: input.workspacePublicId,
        source_entity_type: "backlog_item",
        source_entity_public_id: input.backlogItemPublicId,
        is_read: false,
        triggered_at: { gte: input.since },
        event_type: { in: input.eventTypes },
        actor_user_public_id: input.actorUserPublicId,
      },
      orderBy: { triggered_at: "desc" },
    })
    return row ? rowToState(row) : null
  }

  async applyBurstMerge(input: {
    notificationPublicId: string
    recipientUserPublicId: string
    patch: {
      triggeredAt: Date
      title: string
      summary: string
      groupingKey: string | null
      dedupeKey: string
    }
  }): Promise<boolean> {
    const res = await this.prisma.workActivityNotification.updateMany({
      where: {
        public_id: input.notificationPublicId,
        recipient_user_public_id: input.recipientUserPublicId,
      },
      data: {
        triggered_at: input.patch.triggeredAt,
        title: input.patch.title,
        summary: input.patch.summary,
        grouping_key: input.patch.groupingKey,
        dedupe_key: input.patch.dedupeKey,
      },
    })
    return res.count > 0
  }

  async listForRecipient(filters: ListNotificationsFilters): Promise<WorkActivityNotificationState[]> {
    const where: Prisma.WorkActivityNotificationWhereInput = {
      recipient_user_public_id: filters.recipientUserPublicId,
      triggered_at: { gte: filters.minTriggeredAt, lte: filters.maxTriggeredAt },
    }
    if (filters.workspacePublicId) {
      where.workspace_public_id = filters.workspacePublicId
    }
    if (filters.scope === "mine") {
      where.is_responsibility_related = true
    } else if (filters.scope === "following") {
      where.is_following_related = true
    } else if (filters.scope === "unread") {
      where.is_read = false
    }
    if (filters.after) {
      where.OR = [
        { triggered_at: { lt: filters.after.triggeredAt } },
        {
          triggered_at: filters.after.triggeredAt,
          public_id: { lt: filters.after.notificationPublicId },
        },
      ]
    }
    const rows = await this.prisma.workActivityNotification.findMany({
      where,
      orderBy: [{ triggered_at: "desc" }, { public_id: "desc" }],
      take: filters.limit,
    })
    return rows.map(rowToState)
  }

  async countUnreadForRecipient(input: {
    recipientUserPublicId: string
    workspacePublicId?: string
    minTriggeredAt: Date
    maxTriggeredAt: Date
  }): Promise<number> {
    const where: Prisma.WorkActivityNotificationWhereInput = {
      recipient_user_public_id: input.recipientUserPublicId,
      is_read: false,
      triggered_at: { gte: input.minTriggeredAt, lte: input.maxTriggeredAt },
    }
    if (input.workspacePublicId) {
      where.workspace_public_id = input.workspacePublicId
    }
    return this.prisma.workActivityNotification.count({ where })
  }

  async markRead(notificationPublicId: string, recipientUserPublicId: string, at: Date): Promise<boolean> {
    const existing = await this.prisma.workActivityNotification.findFirst({
      where: { public_id: notificationPublicId, recipient_user_public_id: recipientUserPublicId },
      select: { read_at: true },
    })
    if (!existing) return false
    const res = await this.prisma.workActivityNotification.updateMany({
      where: { public_id: notificationPublicId, recipient_user_public_id: recipientUserPublicId },
      data: {
        is_read: true,
        read_at: existing.read_at ?? at,
      },
    })
    return res.count > 0
  }

  async markAllRead(input: {
    recipientUserPublicId: string
    workspacePublicId?: string
    minTriggeredAt: Date
    maxTriggeredAt: Date
    at: Date
  }): Promise<number> {
    const where: Prisma.WorkActivityNotificationWhereInput = {
      recipient_user_public_id: input.recipientUserPublicId,
      is_read: false,
      triggered_at: { gte: input.minTriggeredAt, lte: input.maxTriggeredAt },
    }
    if (input.workspacePublicId) {
      where.workspace_public_id = input.workspacePublicId
    }
    const res = await this.prisma.workActivityNotification.updateMany({
      where,
      data: { is_read: true, read_at: input.at },
    })
    return res.count
  }
}
