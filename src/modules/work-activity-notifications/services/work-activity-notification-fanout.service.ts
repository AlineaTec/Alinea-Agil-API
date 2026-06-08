import { createHash, randomUUID } from "node:crypto"
import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { ScrumBacklogItemStatus } from "../../project-scrum-backlog/domain/backlog-item-status.js"
import { SPRINT_STATUSES_BLOCKING_OTHER_COMMITMENT } from "../../project-scrum-sprint-planning/domain/sprint-status.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import { sprintBoardColumnLabel } from "../../project-scrum-sprint-board/domain/sprint-board-column-labels.js"
import type { WorkActivityNotificationEventType } from "../domain/work-activity-notification-event-type.js"
import type { WorkActivityNotificationState } from "../domain/work-activity-notification.types.js"
import type { WorkActivityNotificationRepository } from "../persistence/work-activity-notification.repository.js"
import type { WorkItemImplicitFollowRepository } from "../persistence/work-item-implicit-follow.repository.js"
import { classifyScrumLikeStatusChange } from "../policies/scrum-like-status-notification.policy.js"

const BURST_MERGE_MS = 30_000
export const WORK_ACTIVITY_NOTIFICATION_RETENTION_DAYS = 90

const BURST_MERGE_EVENT_TYPES: WorkActivityNotificationEventType[] = ["STATUS_CHANGED", "KANBAN_COLUMN_MOVED"]

function sha256DedupeParts(parts: string[]): string {
  return createHash("sha256").update(parts.join("\x1e")).digest("hex")
}

function retentionFrom(at: Date): Date {
  return new Date(at.getTime() + WORK_ACTIVITY_NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000)
}

/** Unicidad violada (Prisma P2002 o código 11000 legacy). */
function isMongoDuplicateKeyError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false
  const code = (e as { code?: number }).code
  return code === 11_000 || code === 11_001
}

function summarizeCommentBody(body: string): string {
  const t = body.replace(/\s+/g, " ").trim()
  if (t.length <= 160) return t
  return `${t.slice(0, 157)}…`
}

function statusLabel(s: ScrumBacklogItemStatus): string {
  switch (s) {
    case "open":
      return "Abierto"
    case "in_progress":
      return "En progreso"
    case "done":
      return "Hecho"
    default:
      return s
  }
}

function statusCopy(input: {
  eventType: WorkActivityNotificationEventType
  actorName: string
  itemTitle: string
  previousStatus: ScrumBacklogItemStatus
  nextStatus: ScrumBacklogItemStatus
  columnSummary: string | null
}): { title: string; summary: string } {
  const col = input.columnSummary?.trim() ? ` ${input.columnSummary!.trim()}` : ""
  switch (input.eventType) {
    case "CLOSED":
      return {
        title: "Ítem cerrado",
        summary: `${input.actorName} cerró «${input.itemTitle}».${col}`,
      }
    case "REOPENED":
      return {
        title: "Ítem reabierto",
        summary: `${input.actorName} reabrió «${input.itemTitle}».${col}`,
      }
    default:
      return {
        title: "Cambió el estado",
        summary: `${input.actorName} cambió «${input.itemTitle}» de ${statusLabel(
          input.previousStatus,
        )} a ${statusLabel(input.nextStatus)}.${col}`,
      }
  }
}

export type WorkActivityNotificationsPort = WorkActivityNotificationFanoutService

export class WorkActivityNotificationFanoutService {
  constructor(
    private readonly notifications: WorkActivityNotificationRepository,
    private readonly implicitFollow: WorkItemImplicitFollowRepository,
    private readonly workspaceUsers: WorkspaceUserService,
    private readonly sprintPlanningRepository: ScrumSprintPlanningRepository | null = null,
    private readonly backlogRepository: ScrumBacklogRepository | null = null,
  ) {}

  /**
   * Sprint abierto (tablero Scrum) o columna Kanban en el ítem, para enlaces que no manden a backlog Scrum.
   */
  private async resolveNavigationContextForWorkItem(
    workspacePublicId: string,
    projectPublicId: string,
    workItemPublicId: string,
  ): Promise<{ sprintPublicId: string | null; boardColumnPublicId: string | null }> {
    const sprintPublicId = await this.resolveOpenSprintPublicIdForWorkItem(
      workspacePublicId,
      projectPublicId,
      workItemPublicId,
    )
    if (sprintPublicId) return { sprintPublicId, boardColumnPublicId: null }
    if (this.backlogRepository) {
      const item = await this.backlogRepository.findByProjectAndItemId(
        workspacePublicId,
        projectPublicId,
        workItemPublicId,
      )
      if (item?.kanbanColumnPublicId) {
        return { sprintPublicId: null, boardColumnPublicId: item.kanbanColumnPublicId }
      }
    }
    return { sprintPublicId: null, boardColumnPublicId: null }
  }

  /**
   * Si el ítem está comprometido en un sprint no cerrado, enlaces de notificación deben ir al tablero
   * (p.ej. developer sin lectura de backlog Scrum).
   */
  private async resolveOpenSprintPublicIdForWorkItem(
    workspacePublicId: string,
    projectPublicId: string,
    workItemPublicId: string,
  ): Promise<string | null> {
    if (!this.sprintPlanningRepository) return null
    const rows = await this.sprintPlanningRepository.listMembershipRowsForBacklogItemInProject(
      workspacePublicId,
      projectPublicId,
      workItemPublicId,
    )
    if (rows.length === 0) return null
    let best: { sprintPublicId: string; rank: number } | null = null
    for (const row of rows) {
      const sprint = await this.sprintPlanningRepository.findSprintByPublicId(
        workspacePublicId,
        projectPublicId,
        row.sprintPublicId,
      )
      if (!sprint || sprint.status === "closed") continue
      if (!SPRINT_STATUSES_BLOCKING_OTHER_COMMITMENT.has(sprint.status)) continue
      const rank =
        sprint.status === "active" ? 0 : sprint.status === "ready_for_execution" ? 1 : 2
      if (!best || rank < best.rank) {
        best = { sprintPublicId: row.sprintPublicId, rank }
      }
    }
    return best?.sprintPublicId ?? null
  }

  private collectRecipients(input: {
    assigneeUserPublicId: string | null
    followers: string[]
    actorUserPublicId: string
  }): string[] {
    const out = new Set<string>()
    if (input.assigneeUserPublicId && input.assigneeUserPublicId !== input.actorUserPublicId) {
      out.add(input.assigneeUserPublicId)
    }
    for (const f of input.followers) {
      if (f !== input.actorUserPublicId) out.add(f)
    }
    return [...out]
  }

  private async resolveDisplayName(workspacePublicId: string, userPublicId: string): Promise<string> {
    const m = await this.workspaceUsers.findActorMember(workspacePublicId, userPublicId)
    if (!m) return "Usuario"
    const n = m.fullName.trim()
    return n.length > 0 ? n : m.emailNormalized
  }

  private async persistOne(input: {
    workspacePublicId: string
    recipientUserPublicId: string
    eventType: WorkActivityNotificationEventType
    actorUserPublicId: string | null
    actorDisplayName: string | null
    projectPublicId: string
    workItemPublicId: string
    sprintPublicId: string | null
    boardColumnPublicId: string | null
    sourceEntityType: "backlog_item" | "work_item_comment"
    sourceEntityPublicId: string
    title: string
    summary: string
    triggeredAt: Date
    isResponsibilityRelated: boolean
    isFollowingRelated: boolean
    dedupeParts: string[]
    allowBurstMerge: boolean
  }): Promise<void> {
    const dedupeKey = `v1|${sha256DedupeParts(input.dedupeParts)}`
    const at = input.triggeredAt

    if (input.allowBurstMerge && BURST_MERGE_EVENT_TYPES.includes(input.eventType)) {
      const since = new Date(at.getTime() - BURST_MERGE_MS)
      const existing = await this.notifications.findRecentBurstMergeCandidate({
        recipientUserPublicId: input.recipientUserPublicId,
        workspacePublicId: input.workspacePublicId,
        backlogItemPublicId: input.workItemPublicId,
        actorUserPublicId: input.actorUserPublicId,
        eventTypes: [input.eventType],
        since,
      })
      if (existing) {
        const mergeDedupe = `v1|merge|${existing.notificationPublicId}|${at.getTime()}`
        await this.notifications.applyBurstMerge({
          notificationPublicId: existing.notificationPublicId,
          recipientUserPublicId: input.recipientUserPublicId,
          patch: {
            triggeredAt: at,
            title: input.title,
            summary: input.summary,
            groupingKey: `${input.workItemPublicId}:${input.actorUserPublicId ?? "none"}:${Math.floor(at.getTime() / BURST_MERGE_MS)}`,
            dedupeKey: mergeDedupe,
          },
        })
        return
      }
    }

    const row: WorkActivityNotificationState = {
      notificationPublicId: randomUUID(),
      workspacePublicId: input.workspacePublicId,
      recipientUserPublicId: input.recipientUserPublicId,
      eventType: input.eventType,
      eventCategory: "work_activity",
      sourceEntityType: input.sourceEntityType,
      sourceEntityPublicId: input.sourceEntityPublicId,
      projectPublicId: input.projectPublicId,
      sprintPublicId: input.sprintPublicId,
      boardColumnPublicId: input.boardColumnPublicId,
      title: input.title,
      summary: input.summary,
      actorUserPublicId: input.actorUserPublicId,
      actorDisplayName: input.actorDisplayName,
      triggeredAt: at,
      readAt: null,
      isRead: false,
      isResponsibilityRelated: input.isResponsibilityRelated,
      isFollowingRelated: input.isFollowingRelated,
      navigationTarget: {
        kind: "scrum_backlog_item",
        projectPublicId: input.projectPublicId,
        workItemPublicId: input.workItemPublicId,
        sprintPublicId: input.sprintPublicId,
        boardColumnPublicId: input.boardColumnPublicId,
      },
      groupingKey: null,
      dedupeKey,
      resourceAvailability: "available",
      retentionExpiresAt: retentionFrom(at),
    }

    try {
      await this.notifications.insert(row)
    } catch (e) {
      if (isMongoDuplicateKeyError(e)) {
        return
      }
      throw e
    }
  }

  async onAssignmentDelta(input: {
    workspacePublicId: string
    projectPublicId: string
    workItemPublicId: string
    actorUserPublicId: string
    previousAssigneeUserPublicId: string | null
    nextAssigneeUserPublicId: string | null
    itemTitle: string
    assignmentEventId: string
    at: Date
  }): Promise<void> {
    const { at } = input
    await this.implicitFollow.touch({
      workspacePublicId: input.workspacePublicId,
      userPublicId: input.actorUserPublicId,
      backlogItemPublicId: input.workItemPublicId,
      at,
    })
    if (input.nextAssigneeUserPublicId) {
      await this.implicitFollow.touch({
        workspacePublicId: input.workspacePublicId,
        userPublicId: input.nextAssigneeUserPublicId,
        backlogItemPublicId: input.workItemPublicId,
        at,
      })
    }
    if (input.previousAssigneeUserPublicId) {
      await this.implicitFollow.touch({
        workspacePublicId: input.workspacePublicId,
        userPublicId: input.previousAssigneeUserPublicId,
        backlogItemPublicId: input.workItemPublicId,
        at,
      })
    }

    const actorName = await this.resolveDisplayName(input.workspacePublicId, input.actorUserPublicId)
    const followers = await this.implicitFollow.listUserIdsFollowingItem({
      workspacePublicId: input.workspacePublicId,
      backlogItemPublicId: input.workItemPublicId,
      now: at,
    })
    const followerSet = new Set(followers)

    const assignNav = await this.resolveNavigationContextForWorkItem(
      input.workspacePublicId,
      input.projectPublicId,
      input.workItemPublicId,
    )

    if (
      input.nextAssigneeUserPublicId &&
      input.nextAssigneeUserPublicId !== input.previousAssigneeUserPublicId &&
      input.nextAssigneeUserPublicId !== input.actorUserPublicId
    ) {
      const next = input.nextAssigneeUserPublicId
      await this.persistOne({
        workspacePublicId: input.workspacePublicId,
        recipientUserPublicId: next,
        eventType: "ASSIGNED",
        actorUserPublicId: input.actorUserPublicId,
        actorDisplayName: actorName,
        projectPublicId: input.projectPublicId,
        workItemPublicId: input.workItemPublicId,
        sprintPublicId: assignNav.sprintPublicId,
        boardColumnPublicId: assignNav.boardColumnPublicId,
        sourceEntityType: "backlog_item",
        sourceEntityPublicId: input.workItemPublicId,
        title: "Te asignaron un ítem",
        summary: `${actorName} te asignó «${input.itemTitle}».`,
        triggeredAt: at,
        isResponsibilityRelated: true,
        isFollowingRelated: followerSet.has(next),
        dedupeParts: ["ASSIGNED", input.workspacePublicId, input.workItemPublicId, next, input.assignmentEventId],
        allowBurstMerge: false,
      })
    }

    if (
      input.previousAssigneeUserPublicId &&
      input.previousAssigneeUserPublicId !== input.nextAssigneeUserPublicId &&
      input.previousAssigneeUserPublicId !== input.actorUserPublicId
    ) {
      const prev = input.previousAssigneeUserPublicId
      await this.persistOne({
        workspacePublicId: input.workspacePublicId,
        recipientUserPublicId: prev,
        eventType: "UNASSIGNED",
        actorUserPublicId: input.actorUserPublicId,
        actorDisplayName: actorName,
        projectPublicId: input.projectPublicId,
        workItemPublicId: input.workItemPublicId,
        sprintPublicId: assignNav.sprintPublicId,
        boardColumnPublicId: assignNav.boardColumnPublicId,
        sourceEntityType: "backlog_item",
        sourceEntityPublicId: input.workItemPublicId,
        title: "Te desasignaron un ítem",
        summary: `${actorName} te quitó la asignación de «${input.itemTitle}».`,
        triggeredAt: at,
        isResponsibilityRelated: true,
        isFollowingRelated: followerSet.has(prev),
        dedupeParts: ["UNASSIGNED", input.workspacePublicId, input.workItemPublicId, prev, input.assignmentEventId],
        allowBurstMerge: false,
      })
    }
  }

  async onCommentCreated(input: {
    workspacePublicId: string
    projectPublicId: string
    workItemPublicId: string
    itemTitle: string
    commentPublicId: string
    commentBody: string
    assigneeUserPublicId: string | null
    actor: WorkspaceMemberState
    mentionedUserPublicIds: string[]
    at: Date
  }): Promise<void> {
    const { at, actor } = input
    await this.implicitFollow.touch({
      workspacePublicId: input.workspacePublicId,
      userPublicId: actor.userPublicId,
      backlogItemPublicId: input.workItemPublicId,
      at,
    })

    const actorName = actor.fullName.trim() || actor.emailNormalized
    const followers = await this.implicitFollow.listUserIdsFollowingItem({
      workspacePublicId: input.workspacePublicId,
      backlogItemPublicId: input.workItemPublicId,
      now: at,
    })
    const followerSet = new Set(followers)
    const mentioned = new Set(input.mentionedUserPublicIds.filter((u) => u !== actor.userPublicId))

    const recipients = new Set<string>()
    if (input.assigneeUserPublicId && input.assigneeUserPublicId !== actor.userPublicId) {
      recipients.add(input.assigneeUserPublicId)
    }
    for (const f of followers) {
      if (f !== actor.userPublicId) recipients.add(f)
    }
    for (const m of mentioned) recipients.add(m)

    const preview = summarizeCommentBody(input.commentBody)
    const commentNav = await this.resolveNavigationContextForWorkItem(
      input.workspacePublicId,
      input.projectPublicId,
      input.workItemPublicId,
    )

    for (const recipient of recipients) {
      const isAssignee = input.assigneeUserPublicId === recipient
      const isMentioned = mentioned.has(recipient)
      const eventType: WorkActivityNotificationEventType = isMentioned ? "MENTIONED_IN_COMMENT" : "COMMENT_ADDED"
      const title = isMentioned ? "Te mencionaron en un comentario" : "Nuevo comentario"
      const summary = isMentioned
        ? `${actorName} te mencionó en «${input.itemTitle}»: ${preview}`
        : `${actorName} comentó en «${input.itemTitle}»: ${preview}`

      await this.persistOne({
        workspacePublicId: input.workspacePublicId,
        recipientUserPublicId: recipient,
        eventType,
        actorUserPublicId: actor.userPublicId,
        actorDisplayName: actorName,
        projectPublicId: input.projectPublicId,
        workItemPublicId: input.workItemPublicId,
        sprintPublicId: commentNav.sprintPublicId,
        boardColumnPublicId: commentNav.boardColumnPublicId,
        sourceEntityType: "work_item_comment",
        sourceEntityPublicId: input.commentPublicId,
        title,
        summary,
        triggeredAt: at,
        isResponsibilityRelated: isAssignee,
        isFollowingRelated: followerSet.has(recipient) || isMentioned,
        dedupeParts: [eventType, input.workspacePublicId, input.commentPublicId, recipient],
        allowBurstMerge: false,
      })
    }
  }

  async onScrumLikeStatusChanged(input: {
    workspacePublicId: string
    projectPublicId: string
    workItemPublicId: string
    itemTitle: string
    assigneeUserPublicId: string | null
    previousStatus: ScrumBacklogItemStatus
    nextStatus: ScrumBacklogItemStatus
    actorUserPublicId: string
    operationDedupeId: string
    sprintPublicId: string | null
    boardColumnPublicId: string | null
    at: Date
    columnSummary?: string | null
    /** Movimiento en sprint board sin cambio de estado de backlog (p. ej. in_progress ↔ in_review). */
    sprintBoardColumnMove?: { previousColumn: string; targetColumn: string } | null
  }): Promise<void> {
    const classified = classifyScrumLikeStatusChange(input.previousStatus, input.nextStatus)
    let eventType: WorkActivityNotificationEventType | null = classified
    if (
      !eventType &&
      input.previousStatus === input.nextStatus &&
      (Boolean(input.columnSummary?.trim()) || input.sprintBoardColumnMove)
    ) {
      eventType = "STATUS_CHANGED"
    }
    if (!eventType) return

    await this.implicitFollow.touch({
      workspacePublicId: input.workspacePublicId,
      userPublicId: input.actorUserPublicId,
      backlogItemPublicId: input.workItemPublicId,
      at: input.at,
    })

    const actorName = await this.resolveDisplayName(input.workspacePublicId, input.actorUserPublicId)
    const followers = await this.implicitFollow.listUserIdsFollowingItem({
      workspacePublicId: input.workspacePublicId,
      backlogItemPublicId: input.workItemPublicId,
      now: input.at,
    })

    const { title, summary } = classified
      ? statusCopy({
          eventType: classified,
          actorName,
          itemTitle: input.itemTitle,
          previousStatus: input.previousStatus,
          nextStatus: input.nextStatus,
          columnSummary: input.columnSummary ?? null,
        })
      : input.sprintBoardColumnMove
        ? {
            title: "Cambio de columna en el sprint",
            summary: `${actorName} movió «${input.itemTitle}» de «${sprintBoardColumnLabel(
              input.sprintBoardColumnMove.previousColumn,
            )}» a «${sprintBoardColumnLabel(input.sprintBoardColumnMove.targetColumn)}».`,
          }
        : {
            title: "Se movió en el tablero de sprint",
            summary: `${actorName} movió «${input.itemTitle}».${input.columnSummary?.trim() ? ` ${input.columnSummary!.trim()}` : ""}`,
          }

    const recipientIds = this.collectRecipients({
      assigneeUserPublicId: input.assigneeUserPublicId,
      followers,
      actorUserPublicId: input.actorUserPublicId,
    })

    for (const recipient of recipientIds) {
      const isAssignee = input.assigneeUserPublicId === recipient
      const isFollower = followers.includes(recipient)
      await this.persistOne({
        workspacePublicId: input.workspacePublicId,
        recipientUserPublicId: recipient,
        eventType,
        actorUserPublicId: input.actorUserPublicId,
        actorDisplayName: actorName,
        projectPublicId: input.projectPublicId,
        workItemPublicId: input.workItemPublicId,
        sprintPublicId: input.sprintPublicId,
        boardColumnPublicId: input.boardColumnPublicId,
        sourceEntityType: "backlog_item",
        sourceEntityPublicId: input.workItemPublicId,
        title,
        summary,
        triggeredAt: input.at,
        isResponsibilityRelated: isAssignee,
        isFollowingRelated: isFollower,
        dedupeParts: [eventType, input.workspacePublicId, input.workItemPublicId, recipient, input.operationDedupeId],
        allowBurstMerge: true,
      })
    }
  }

  async onKanbanColumnMoved(input: {
    workspacePublicId: string
    projectPublicId: string
    workItemPublicId: string
    itemTitle: string
    assigneeUserPublicId: string | null
    actorUserPublicId: string
    fromColumnName: string
    toColumnName: string
    operationDedupeSecond: number
    toColumnPublicId: string
    at: Date
  }): Promise<void> {
    const { at } = input
    await this.implicitFollow.touch({
      workspacePublicId: input.workspacePublicId,
      userPublicId: input.actorUserPublicId,
      backlogItemPublicId: input.workItemPublicId,
      at,
    })
    const actorName = await this.resolveDisplayName(input.workspacePublicId, input.actorUserPublicId)
    const followers = await this.implicitFollow.listUserIdsFollowingItem({
      workspacePublicId: input.workspacePublicId,
      backlogItemPublicId: input.workItemPublicId,
      now: at,
    })
    const recipientIds = this.collectRecipients({
      assigneeUserPublicId: input.assigneeUserPublicId,
      followers,
      actorUserPublicId: input.actorUserPublicId,
    })
    const title = "Se movió la tarjeta Kanban"
    const summary = `${actorName} movió «${input.itemTitle}» de «${input.fromColumnName}» a «${input.toColumnName}».`
    const opId = `kcol|${input.fromColumnName}|${input.toColumnName}|${input.operationDedupeSecond}`
    for (const recipient of recipientIds) {
      const isAssignee = input.assigneeUserPublicId === recipient
      const isFollower = followers.includes(recipient)
      await this.persistOne({
        workspacePublicId: input.workspacePublicId,
        recipientUserPublicId: recipient,
        eventType: "KANBAN_COLUMN_MOVED",
        actorUserPublicId: input.actorUserPublicId,
        actorDisplayName: actorName,
        projectPublicId: input.projectPublicId,
        workItemPublicId: input.workItemPublicId,
        sprintPublicId: null,
        boardColumnPublicId: input.toColumnPublicId,
        sourceEntityType: "backlog_item",
        sourceEntityPublicId: input.workItemPublicId,
        title,
        summary,
        triggeredAt: at,
        isResponsibilityRelated: isAssignee,
        isFollowingRelated: isFollower,
        dedupeParts: [
          "KANBAN_COLUMN_MOVED",
          input.workspacePublicId,
          input.workItemPublicId,
          recipient,
          opId,
        ],
        allowBurstMerge: true,
      })
    }
  }

  async onBlockToggled(input: {
    workspacePublicId: string
    projectPublicId: string
    workItemPublicId: string
    itemTitle: string
    assigneeUserPublicId: string | null
    actorUserPublicId: string
    blocked: boolean
    reason: string | null
    operationDedupeSecond: number
    at: Date
  }): Promise<void> {
    const { at } = input
    await this.implicitFollow.touch({
      workspacePublicId: input.workspacePublicId,
      userPublicId: input.actorUserPublicId,
      backlogItemPublicId: input.workItemPublicId,
      at,
    })
    const actorName = await this.resolveDisplayName(input.workspacePublicId, input.actorUserPublicId)
    const followers = await this.implicitFollow.listUserIdsFollowingItem({
      workspacePublicId: input.workspacePublicId,
      backlogItemPublicId: input.workItemPublicId,
      now: at,
    })
    const recipientIds = this.collectRecipients({
      assigneeUserPublicId: input.assigneeUserPublicId,
      followers,
      actorUserPublicId: input.actorUserPublicId,
    })
    const eventType: WorkActivityNotificationEventType = input.blocked ? "BLOCKED" : "UNBLOCKED"
    const title = input.blocked ? "Ítem bloqueado" : "Ítem desbloqueado"
    const reason = input.reason?.trim()
    const summary = input.blocked
      ? `${actorName} bloqueó «${input.itemTitle}»${reason ? `: ${reason}` : "."}`
      : `${actorName} desbloqueó «${input.itemTitle}».`
    const opId = `${eventType}|${input.operationDedupeSecond}|${reason ?? ""}`
    const blockNav = await this.resolveNavigationContextForWorkItem(
      input.workspacePublicId,
      input.projectPublicId,
      input.workItemPublicId,
    )
    for (const recipient of recipientIds) {
      const isAssignee = input.assigneeUserPublicId === recipient
      const isFollower = followers.includes(recipient)
      await this.persistOne({
        workspacePublicId: input.workspacePublicId,
        recipientUserPublicId: recipient,
        eventType,
        actorUserPublicId: input.actorUserPublicId,
        actorDisplayName: actorName,
        projectPublicId: input.projectPublicId,
        workItemPublicId: input.workItemPublicId,
        sprintPublicId: blockNav.sprintPublicId,
        boardColumnPublicId: blockNav.boardColumnPublicId,
        sourceEntityType: "backlog_item",
        sourceEntityPublicId: input.workItemPublicId,
        title,
        summary,
        triggeredAt: at,
        isResponsibilityRelated: isAssignee,
        isFollowingRelated: isFollower,
        dedupeParts: [eventType, input.workspacePublicId, input.workItemPublicId, recipient, opId],
        allowBurstMerge: false,
      })
    }
  }

  async onSprintCommitmentChanged(input: {
    workspacePublicId: string
    projectPublicId: string
    sprintPublicId: string
    workItemPublicId: string
    itemTitle: string
    assigneeUserPublicId: string | null
    actorUserPublicId: string
    added: boolean
    operationDedupeId: string
    at: Date
  }): Promise<void> {
    const { at } = input
    await this.implicitFollow.touch({
      workspacePublicId: input.workspacePublicId,
      userPublicId: input.actorUserPublicId,
      backlogItemPublicId: input.workItemPublicId,
      at,
    })
    const actorName = await this.resolveDisplayName(input.workspacePublicId, input.actorUserPublicId)
    const followers = await this.implicitFollow.listUserIdsFollowingItem({
      workspacePublicId: input.workspacePublicId,
      backlogItemPublicId: input.workItemPublicId,
      now: at,
    })
    const recipientIds = this.collectRecipients({
      assigneeUserPublicId: input.assigneeUserPublicId,
      followers,
      actorUserPublicId: input.actorUserPublicId,
    })
    const eventType: WorkActivityNotificationEventType = input.added ? "SPRINT_ADDED" : "SPRINT_REMOVED"
    const title = input.added ? "Ítem agregado al sprint" : "Ítem retirado del sprint"
    const summary = input.added
      ? `${actorName} comprometió «${input.itemTitle}» con el sprint.`
      : `${actorName} retiró «${input.itemTitle}» del sprint.`
    for (const recipient of recipientIds) {
      const isAssignee = input.assigneeUserPublicId === recipient
      const isFollower = followers.includes(recipient)
      await this.persistOne({
        workspacePublicId: input.workspacePublicId,
        recipientUserPublicId: recipient,
        eventType,
        actorUserPublicId: input.actorUserPublicId,
        actorDisplayName: actorName,
        projectPublicId: input.projectPublicId,
        workItemPublicId: input.workItemPublicId,
        sprintPublicId: input.sprintPublicId,
        boardColumnPublicId: null,
        sourceEntityType: "backlog_item",
        sourceEntityPublicId: input.workItemPublicId,
        title,
        summary,
        triggeredAt: at,
        isResponsibilityRelated: isAssignee,
        isFollowingRelated: isFollower,
        dedupeParts: [eventType, input.workspacePublicId, input.sprintPublicId, input.workItemPublicId, recipient, input.operationDedupeId],
        allowBurstMerge: false,
      })
    }
  }

  /**
   * Movimiento entre columnas del sprint board cuando no hay transición de estado de backlog
   * (p. ej. En progreso ↔ En revisión, mismo `status` en backlog): notificación con etiquetas de columna legibles.
   */
  async onSprintBoardColumnMovedWithoutStatusChange(input: {
    workspacePublicId: string
    projectPublicId: string
    sprintPublicId: string
    workItemPublicId: string
    itemTitle: string
    assigneeUserPublicId: string | null
    actorUserPublicId: string
    previousColumn: string
    targetColumn: string
    backlogStatus: ScrumBacklogItemStatus
    operationDedupeId: string
    at: Date
  }): Promise<void> {
    await this.onScrumLikeStatusChanged({
      workspacePublicId: input.workspacePublicId,
      projectPublicId: input.projectPublicId,
      workItemPublicId: input.workItemPublicId,
      itemTitle: input.itemTitle,
      assigneeUserPublicId: input.assigneeUserPublicId,
      previousStatus: input.backlogStatus,
      nextStatus: input.backlogStatus,
      actorUserPublicId: input.actorUserPublicId,
      operationDedupeId: input.operationDedupeId,
      sprintPublicId: input.sprintPublicId,
      boardColumnPublicId: input.targetColumn,
      at: input.at,
      columnSummary: null,
      sprintBoardColumnMove: {
        previousColumn: input.previousColumn,
        targetColumn: input.targetColumn,
      },
    })
  }

  /**
   * Acción acordada en retrospectiva guiada: asignación de responsable (cierre o seguimiento centralizado).
   */
  async onGuidedRetroActionAssigned(input: {
    workspacePublicId: string
    projectPublicId: string
    actionItemPublicId: string
    actorUserPublicId: string
    assigneeUserPublicId: string
    actionTitle: string
    assignmentEventId: string
    at: Date
  }): Promise<void> {
    if (input.assigneeUserPublicId === input.actorUserPublicId) {
      return
    }
    const actorName = await this.resolveDisplayName(input.workspacePublicId, input.actorUserPublicId)
    const dedupeKey = `v1|${sha256DedupeParts([
      "ASSIGNED",
      "guided_retro_action",
      input.workspacePublicId,
      input.projectPublicId,
      input.actionItemPublicId,
      input.assigneeUserPublicId,
      input.assignmentEventId,
    ])}`
    const at = input.at
    const row: WorkActivityNotificationState = {
      notificationPublicId: randomUUID(),
      workspacePublicId: input.workspacePublicId,
      recipientUserPublicId: input.assigneeUserPublicId,
      eventType: "ASSIGNED",
      eventCategory: "work_activity",
      sourceEntityType: "guided_retro_action_item",
      sourceEntityPublicId: input.actionItemPublicId,
      projectPublicId: input.projectPublicId,
      sprintPublicId: null,
      boardColumnPublicId: null,
      title: "Te asignaron una acción de retrospectiva",
      summary: `${actorName} te asignó «${input.actionTitle}».`,
      actorUserPublicId: input.actorUserPublicId,
      actorDisplayName: actorName,
      triggeredAt: at,
      readAt: null,
      isRead: false,
      isResponsibilityRelated: true,
      isFollowingRelated: false,
      navigationTarget: {
        kind: "guided_retro_action",
        projectPublicId: input.projectPublicId,
        actionItemPublicId: input.actionItemPublicId,
      },
      groupingKey: null,
      dedupeKey,
      resourceAvailability: "available",
      retentionExpiresAt: retentionFrom(at),
    }
    try {
      await this.notifications.insert(row)
    } catch (e) {
      if (isMongoDuplicateKeyError(e)) {
        return
      }
      throw e
    }
  }
}
