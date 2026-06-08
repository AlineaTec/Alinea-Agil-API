import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { WorkActivityNotificationState } from "../domain/work-activity-notification.types.js"
import {
  WorkActivityNotificationNotFoundError,
  WorkActivityNotificationValidationError,
} from "../domain/work-activity-notification.errors.js"
import type {
  ListNotificationsCursor,
  WorkActivityNotificationRepository,
} from "../persistence/work-activity-notification.repository.js"
import { WORK_ACTIVITY_NOTIFICATION_RETENTION_DAYS } from "./work-activity-notification-fanout.service.js"

export type WorkActivityNotificationApiDto = {
  notificationPublicId: string
  workspacePublicId: string
  eventType: string
  eventCategory: string
  title: string
  summary: string
  actor: { userPublicId: string; displayName: string | null } | null
  triggeredAt: string
  readAt: string | null
  isRead: boolean
  isResponsibilityRelated: boolean
  isFollowingRelated: boolean
  navigationTarget: WorkActivityNotificationState["navigationTarget"]
  resourceAvailability: WorkActivityNotificationState["resourceAvailability"]
  context: {
    projectPublicId: string
    workItemPublicId: string | null
    guidedRetroActionItemPublicId: string | null
    sprintPublicId: string | null
    boardColumnPublicId: string | null
  }
}

function decodeCursor(raw: string | undefined): ListNotificationsCursor | null {
  if (!raw || raw.length === 0) return null
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8")
    const data = JSON.parse(json) as { t?: string; id?: string }
    if (typeof data.t !== "string" || typeof data.id !== "string") return null
    const triggeredAt = new Date(data.t)
    if (Number.isNaN(triggeredAt.getTime())) return null
    return { triggeredAt, notificationPublicId: data.id }
  } catch {
    return null
  }
}

export function encodeNotificationCursor(c: ListNotificationsCursor): string {
  return Buffer.from(
    JSON.stringify({ t: c.triggeredAt.toISOString(), id: c.notificationPublicId }),
    "utf8",
  ).toString("base64url")
}

export class WorkActivityNotificationQueryService {
  constructor(
    private readonly notifications: WorkActivityNotificationRepository,
    private readonly backlogRepo: ScrumBacklogRepository,
  ) {}

  private windowBounds(now: Date, daysWindow: number): { minTriggeredAt: Date; maxTriggeredAt: Date } {
    const maxTriggeredAt = now
    const retentionMs = WORK_ACTIVITY_NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000
    const retentionFloor = new Date(now.getTime() - retentionMs)
    const windowStart = new Date(now.getTime() - Math.min(daysWindow, WORK_ACTIVITY_NOTIFICATION_RETENTION_DAYS) * 24 * 60 * 60 * 1000)
    const minTriggeredAt = windowStart.getTime() > retentionFloor.getTime() ? windowStart : retentionFloor
    return { minTriggeredAt, maxTriggeredAt }
  }

  private async toDto(
    row: WorkActivityNotificationState,
    availability: Map<string, boolean>,
  ): Promise<WorkActivityNotificationApiDto> {
    if (row.navigationTarget.kind === "guided_retro_action") {
      return {
        notificationPublicId: row.notificationPublicId,
        workspacePublicId: row.workspacePublicId,
        eventType: row.eventType,
        eventCategory: row.eventCategory,
        title: row.title,
        summary: row.summary,
        actor:
          row.actorUserPublicId === null
            ? null
            : { userPublicId: row.actorUserPublicId, displayName: row.actorDisplayName },
        triggeredAt: row.triggeredAt.toISOString(),
        readAt: row.readAt?.toISOString() ?? null,
        isRead: row.isRead,
        isResponsibilityRelated: row.isResponsibilityRelated,
        isFollowingRelated: row.isFollowingRelated,
        navigationTarget: row.navigationTarget,
        resourceAvailability: row.resourceAvailability,
        context: {
          projectPublicId: row.projectPublicId,
          workItemPublicId: null,
          guidedRetroActionItemPublicId: row.navigationTarget.actionItemPublicId,
          sprintPublicId: null,
          boardColumnPublicId: null,
        },
      }
    }

    const key = `${row.workspacePublicId}|${row.projectPublicId}|${row.navigationTarget.workItemPublicId}`
    const itemExists = availability.get(key) === true
    let resourceAvailability = row.resourceAvailability
    let navigationTarget = row.navigationTarget
    let title = row.title
    let summary = row.summary
    if (!itemExists) {
      resourceAvailability = "unavailable"
      navigationTarget = {
        kind: "scrum_backlog_item",
        projectPublicId: row.projectPublicId,
        workItemPublicId: row.navigationTarget.workItemPublicId,
        sprintPublicId: null,
        boardColumnPublicId: null,
      }
      title = row.eventType === "MENTIONED_IN_COMMENT" || row.eventType === "COMMENT_ADDED" ? "Comentario ya no disponible" : title
      summary = "El ítem de trabajo ya no está disponible o fue eliminado."
    }

    return {
      notificationPublicId: row.notificationPublicId,
      workspacePublicId: row.workspacePublicId,
      eventType: row.eventType,
      eventCategory: row.eventCategory,
      title,
      summary,
      actor:
        row.actorUserPublicId === null
          ? null
          : { userPublicId: row.actorUserPublicId, displayName: row.actorDisplayName },
      triggeredAt: row.triggeredAt.toISOString(),
      readAt: row.readAt?.toISOString() ?? null,
      isRead: row.isRead,
      isResponsibilityRelated: row.isResponsibilityRelated,
      isFollowingRelated: row.isFollowingRelated,
      navigationTarget,
      resourceAvailability,
      context: {
        projectPublicId: row.projectPublicId,
        workItemPublicId: row.navigationTarget.workItemPublicId,
        guidedRetroActionItemPublicId: null,
        sprintPublicId: row.sprintPublicId,
        boardColumnPublicId: row.boardColumnPublicId,
      },
    }
  }

  private async resolveAvailabilityBatch(rows: WorkActivityNotificationState[]): Promise<Map<string, boolean>> {
    const keys = new Map<string, { workspacePublicId: string; projectPublicId: string; itemId: string }>()
    for (const r of rows) {
      if (r.navigationTarget.kind !== "scrum_backlog_item") continue
      const k = `${r.workspacePublicId}|${r.projectPublicId}|${r.navigationTarget.workItemPublicId}`
      keys.set(k, {
        workspacePublicId: r.workspacePublicId,
        projectPublicId: r.projectPublicId,
        itemId: r.navigationTarget.workItemPublicId,
      })
    }
    const availability = new Map<string, boolean>()
    for (const [k, v] of keys) {
      const item = await this.backlogRepo.findByProjectAndItemId(v.workspacePublicId, v.projectPublicId, v.itemId)
      availability.set(k, !!item)
    }
    return availability
  }

  async listForUser(input: {
    recipientUserPublicId: string
    workspacePublicId?: string
    scope: "all" | "mine" | "following" | "unread"
    limit: number
    daysWindow: number
    cursorRaw: string | undefined
    now?: Date
  }): Promise<{ items: WorkActivityNotificationApiDto[]; nextCursor: string | null }> {
    const now = input.now ?? new Date()
    const { minTriggeredAt, maxTriggeredAt } = this.windowBounds(now, input.daysWindow)
    const after = decodeCursor(input.cursorRaw)
    if (input.cursorRaw && after === null) {
      throw new WorkActivityNotificationValidationError("Invalid cursor.")
    }
    const rows = await this.notifications.listForRecipient({
      recipientUserPublicId: input.recipientUserPublicId,
      workspacePublicId: input.workspacePublicId,
      scope: input.scope,
      minTriggeredAt,
      maxTriggeredAt,
      limit: input.limit + 1,
      after,
    })
    const hasMore = rows.length > input.limit
    const page = hasMore ? rows.slice(0, input.limit) : rows
    const availability = await this.resolveAvailabilityBatch(page)
    const items = await Promise.all(page.map((r) => this.toDto(r, availability)))
    let nextCursor: string | null = null
    if (hasMore && page.length > 0) {
      const last = page[page.length - 1]!
      nextCursor = encodeNotificationCursor({
        triggeredAt: last.triggeredAt,
        notificationPublicId: last.notificationPublicId,
      })
    }
    return { items, nextCursor }
  }

  async getOneForUser(input: {
    recipientUserPublicId: string
    notificationPublicId: string
  }): Promise<WorkActivityNotificationApiDto> {
    const row = await this.notifications.findByPublicIdAndRecipient(
      input.notificationPublicId,
      input.recipientUserPublicId,
    )
    if (!row) {
      throw new WorkActivityNotificationNotFoundError()
    }
    const availability = await this.resolveAvailabilityBatch([row])
    return this.toDto(row, availability)
  }

  async unreadCountForUser(input: {
    recipientUserPublicId: string
    workspacePublicId?: string
    daysWindow: number
    now?: Date
  }): Promise<{ count: number }> {
    const now = input.now ?? new Date()
    const { minTriggeredAt, maxTriggeredAt } = this.windowBounds(now, input.daysWindow)
    const count = await this.notifications.countUnreadForRecipient({
      recipientUserPublicId: input.recipientUserPublicId,
      workspacePublicId: input.workspacePublicId,
      minTriggeredAt,
      maxTriggeredAt,
    })
    return { count }
  }

  async markOneRead(input: {
    recipientUserPublicId: string
    notificationPublicId: string
    at?: Date
  }): Promise<void> {
    const at = input.at ?? new Date()
    const ok = await this.notifications.markRead(input.notificationPublicId, input.recipientUserPublicId, at)
    if (!ok) {
      throw new WorkActivityNotificationNotFoundError()
    }
  }

  async markAllRead(input: {
    recipientUserPublicId: string
    workspacePublicId?: string
    daysWindow: number
    at?: Date
    now?: Date
  }): Promise<{ updated: number }> {
    const now = input.now ?? new Date()
    const at = input.at ?? now
    const { minTriggeredAt, maxTriggeredAt } = this.windowBounds(now, input.daysWindow)
    const updated = await this.notifications.markAllRead({
      recipientUserPublicId: input.recipientUserPublicId,
      workspacePublicId: input.workspacePublicId,
      minTriggeredAt,
      maxTriggeredAt,
      at,
    })
    return { updated }
  }
}
