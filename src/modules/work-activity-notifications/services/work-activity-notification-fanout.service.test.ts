import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { describe, it, beforeEach } from "node:test"
import type { ScrumBacklogItemState } from "../../project-scrum-backlog/domain/scrum-backlog-item.js"
import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { WorkActivityNotificationEventType } from "../domain/work-activity-notification-event-type.js"
import type { WorkActivityNotificationState } from "../domain/work-activity-notification.types.js"
import type {
  ListNotificationsFilters,
  WorkActivityNotificationRepository,
} from "../persistence/work-activity-notification.repository.js"
import type { WorkItemImplicitFollowRepository } from "../persistence/work-item-implicit-follow.repository.js"
import { WorkActivityNotificationQueryService } from "./work-activity-notification-query.service.js"
import { WorkActivityNotificationFanoutService } from "./work-activity-notification-fanout.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"

const WS = "a0000000-0000-4000-8000-000000000001"
const PROJ = "b0000000-0000-4000-8000-000000000002"
const ITEM = "c0000000-0000-4000-8000-00000000cafe"
const ACTOR = "d0000000-0000-4000-8000-000000000010"
const ASSIGNEE = "d0000000-0000-4000-8000-000000000011"
const FOLLOWER = "d0000000-0000-4000-8000-000000000012"

const IMPLICIT_MS = 30 * 24 * 60 * 60 * 1000

function member(
  userPublicId: string,
  over: Partial<WorkspaceMemberState> = {},
): WorkspaceMemberState {
  const now = new Date()
  return {
    membershipPublicId: randomUUID(),
    workspacePublicId: WS,
    userPublicId,
    emailNormalized: `${userPublicId.slice(0, 8)}@test.local`,
    fullName: over.fullName ?? "Test User",
    status: "active",
    hasSeatAssigned: true,
    workspaceRoleAdministrative: null,
    workspaceRoleMethodological: null,
    createdAt: now,
    updatedAt: now,
    ...over,
  }
}

class MemImplicit implements WorkItemImplicitFollowRepository {
  touches = new Map<string, Date>()

  private key(w: string, u: string, i: string) {
    return `${w}|${u}|${i}`
  }

  async touch(input: {
    workspacePublicId: string
    userPublicId: string
    backlogItemPublicId: string
    at: Date
  }): Promise<void> {
    const k = this.key(input.workspacePublicId, input.userPublicId, input.backlogItemPublicId)
    const prev = this.touches.get(k)
    const next =
      prev && prev.getTime() > input.at.getTime() ? prev : input.at
    this.touches.set(k, next)
  }

  async listUserIdsFollowingItem(input: {
    workspacePublicId: string
    backlogItemPublicId: string
    now: Date
  }): Promise<string[]> {
    const cutoff = input.now.getTime() - IMPLICIT_MS
    const out: string[] = []
    for (const [k, at] of this.touches) {
      const [w, u, item] = k.split("|")
      if (w === input.workspacePublicId && item === input.backlogItemPublicId && at.getTime() >= cutoff) {
        out.push(u!)
      }
    }
    return out
  }
}

class MemNotifyRepo implements WorkActivityNotificationRepository {
  rows: WorkActivityNotificationState[] = []

  async insert(state: WorkActivityNotificationState): Promise<void> {
    if (this.rows.some((r) => r.dedupeKey === state.dedupeKey)) {
      const e = new Error("duplicate")
      ;(e as { code: number }).code = 11_000
      throw e
    }
    this.rows.push({ ...state })
  }

  async findByPublicIdAndRecipient(
    notificationPublicId: string,
    recipientUserPublicId: string,
  ): Promise<WorkActivityNotificationState | null> {
    return (
      this.rows.find(
        (r) => r.notificationPublicId === notificationPublicId && r.recipientUserPublicId === recipientUserPublicId,
      ) ?? null
    )
  }

  async findRecentBurstMergeCandidate(input: {
    recipientUserPublicId: string
    workspacePublicId: string
    backlogItemPublicId: string
    actorUserPublicId: string | null
    eventTypes: WorkActivityNotificationEventType[]
    since: Date
  }): Promise<WorkActivityNotificationState | null> {
    const found = this.rows.filter(
      (r) =>
        r.recipientUserPublicId === input.recipientUserPublicId &&
        r.workspacePublicId === input.workspacePublicId &&
        r.sourceEntityType === "backlog_item" &&
        r.sourceEntityPublicId === input.backlogItemPublicId &&
        r.isRead === false &&
        r.triggeredAt.getTime() >= input.since.getTime() &&
        input.eventTypes.includes(r.eventType) &&
        r.actorUserPublicId === input.actorUserPublicId,
    )
    found.sort((a, b) => b.triggeredAt.getTime() - a.triggeredAt.getTime())
    return found[0] ?? null
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
    const row = this.rows.find(
      (r) => r.notificationPublicId === input.notificationPublicId && r.recipientUserPublicId === input.recipientUserPublicId,
    )
    if (!row) return false
    row.triggeredAt = input.patch.triggeredAt
    row.title = input.patch.title
    row.summary = input.patch.summary
    row.groupingKey = input.patch.groupingKey
    row.dedupeKey = input.patch.dedupeKey
    return true
  }

  async listForRecipient(filters: ListNotificationsFilters): Promise<WorkActivityNotificationState[]> {
    let xs = this.rows.filter(
      (r) =>
        r.recipientUserPublicId === filters.recipientUserPublicId &&
        r.triggeredAt.getTime() >= filters.minTriggeredAt.getTime() &&
        r.triggeredAt.getTime() <= filters.maxTriggeredAt.getTime(),
    )
    if (filters.workspacePublicId) {
      xs = xs.filter((r) => r.workspacePublicId === filters.workspacePublicId)
    }
    if (filters.scope === "mine") xs = xs.filter((r) => r.isResponsibilityRelated)
    if (filters.scope === "following") xs = xs.filter((r) => r.isFollowingRelated)
    if (filters.scope === "unread") xs = xs.filter((r) => !r.isRead)
    xs.sort((a, b) => {
      const dt = b.triggeredAt.getTime() - a.triggeredAt.getTime()
      if (dt !== 0) return dt
      return b.notificationPublicId.localeCompare(a.notificationPublicId)
    })
    if (filters.after) {
      xs = xs.filter((r) => {
        if (r.triggeredAt.getTime() < filters.after!.triggeredAt.getTime()) return true
        if (r.triggeredAt.getTime() > filters.after!.triggeredAt.getTime()) return false
        return r.notificationPublicId.localeCompare(filters.after!.notificationPublicId) < 0
      })
    }
    return xs.slice(0, filters.limit)
  }

  async countUnreadForRecipient(input: {
    recipientUserPublicId: string
    workspacePublicId?: string
    minTriggeredAt: Date
    maxTriggeredAt: Date
  }): Promise<number> {
    const list = await this.listForRecipient({
      recipientUserPublicId: input.recipientUserPublicId,
      workspacePublicId: input.workspacePublicId,
      scope: "unread",
      minTriggeredAt: input.minTriggeredAt,
      maxTriggeredAt: input.maxTriggeredAt,
      limit: 10_000,
      after: null,
    })
    return list.length
  }

  async markRead(notificationPublicId: string, recipientUserPublicId: string, at: Date): Promise<boolean> {
    const row = this.rows.find(
      (r) => r.notificationPublicId === notificationPublicId && r.recipientUserPublicId === recipientUserPublicId,
    )
    if (!row) return false
    row.isRead = true
    if (!row.readAt) row.readAt = at
    return true
  }

  async markAllRead(input: {
    recipientUserPublicId: string
    workspacePublicId?: string
    minTriggeredAt: Date
    maxTriggeredAt: Date
    at: Date
  }): Promise<number> {
    let n = 0
    for (const row of this.rows) {
      if (row.recipientUserPublicId !== input.recipientUserPublicId) continue
      if (input.workspacePublicId && row.workspacePublicId !== input.workspacePublicId) continue
      if (row.isRead) continue
      if (
        row.triggeredAt.getTime() < input.minTriggeredAt.getTime() ||
        row.triggeredAt.getTime() > input.maxTriggeredAt.getTime()
      ) {
        continue
      }
      row.isRead = true
      row.readAt = input.at
      n += 1
    }
    return n
  }
}

class MemBacklog implements ScrumBacklogRepository {
  item: ScrumBacklogItemState | null
  constructor(seed: ScrumBacklogItemState) {
    this.item = seed
  }
  async findByProjectAndItemId(
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
  ): Promise<ScrumBacklogItemState | null> {
    if (!this.item) return null
    if (
      this.item.workspacePublicId === workspacePublicId &&
      this.item.projectPublicId === projectPublicId &&
      this.item.backlogItemPublicId === backlogItemPublicId
    ) {
      return this.item
    }
    return null
  }
  async replace(): Promise<void> {}
  async insert(): Promise<void> {}
}

function stubWorkspaceUsers(members: WorkspaceMemberState[]): WorkspaceUserService {
  return {
    async listMembers(workspacePublicId: string) {
      return members.filter((m) => m.workspacePublicId === workspacePublicId)
    },
    async findActorMember(workspacePublicId: string, userPublicId: string) {
      return (
        members.find((m) => m.workspacePublicId === workspacePublicId && m.userPublicId === userPublicId) ?? null
      )
    },
  } as unknown as WorkspaceUserService
}

describe("work-activity-notification fanout + query (in-memory)", () => {
  let notifyRepo: MemNotifyRepo
  let implicit: MemImplicit
  let fanout: WorkActivityNotificationFanoutService
  let query: WorkActivityNotificationQueryService
  let backlog: MemBacklog

  beforeEach(() => {
    notifyRepo = new MemNotifyRepo()
    implicit = new MemImplicit()
    const users = stubWorkspaceUsers([
      member(ACTOR, { fullName: "Actor" }),
      member(ASSIGNEE, { fullName: "Assignee User", emailNormalized: "assignee@test.local" }),
      member(FOLLOWER, { fullName: "Follower User" }),
    ])
    fanout = new WorkActivityNotificationFanoutService(notifyRepo, implicit, users, null, null)
    const now = new Date()
    backlog = new MemBacklog({
      backlogItemPublicId: ITEM,
      workspacePublicId: WS,
      projectPublicId: PROJ,
      itemType: "user_story",
      title: "Historia",
      description: "",
      status: "open",
      sortOrder: 0,
      parentItemPublicId: null,
      createdByUserPublicId: ACTOR,
      createdAt: now,
      updatedAt: now,
      completedInSprintPublicId: null,
      assignedUserPublicId: ASSIGNEE,
      assignmentUpdatedAt: now,
      assignmentUpdatedByUserPublicId: ACTOR,
      assignmentHistory: [],
      storyPoints: null,
      priorityLevel: "none",
      acceptanceCriteria: [],
      commentsCount: 0,
      kanbanColumnPublicId: null,
      isBlocked: false,
      blockedReason: null,
    })
    query = new WorkActivityNotificationQueryService(notifyRepo, backlog as unknown as ScrumBacklogRepository)
  })

  it("ASSIGNED generates responsibility for assignee", async () => {
    await fanout.onAssignmentDelta({
      workspacePublicId: WS,
      projectPublicId: PROJ,
      workItemPublicId: ITEM,
      actorUserPublicId: ACTOR,
      previousAssigneeUserPublicId: null,
      nextAssigneeUserPublicId: ASSIGNEE,
      itemTitle: "Historia",
      assignmentEventId: randomUUID(),
      at: new Date(),
    })
    const n = notifyRepo.rows.find((r) => r.recipientUserPublicId === ASSIGNEE)
    assert.ok(n)
    assert.equal(n!.eventType, "ASSIGNED")
    assert.equal(n!.isResponsibilityRelated, true)
  })

  it("MENTIONED_IN_COMMENT collapses to one row with assignee+mention flags", async () => {
    const body = `Hi @assignee-user take a look`
    await fanout.onCommentCreated({
      workspacePublicId: WS,
      projectPublicId: PROJ,
      workItemPublicId: ITEM,
      itemTitle: "Historia",
      commentPublicId: randomUUID(),
      commentBody: body,
      assigneeUserPublicId: ASSIGNEE,
      actor: member(ACTOR) as WorkspaceMemberState,
      mentionedUserPublicIds: [ASSIGNEE],
      at: new Date(),
    })
    const forAssignee = notifyRepo.rows.filter((r) => r.recipientUserPublicId === ASSIGNEE)
    assert.equal(forAssignee.length, 1)
    assert.equal(forAssignee[0]!.eventType, "MENTIONED_IN_COMMENT")
    assert.equal(forAssignee[0]!.isResponsibilityRelated, true)
    assert.equal(forAssignee[0]!.isFollowingRelated, true)
  })

  it("dedupeKey collision is ignored (retry)", async () => {
    const parts = ["ASSIGNED", WS, ITEM, ASSIGNEE, "same"]
    const dedupeKey = `v1|${createHash("sha256").update(parts.join("\x1e")).digest("hex")}`
    await notifyRepo.insert({
      notificationPublicId: randomUUID(),
      workspacePublicId: WS,
      recipientUserPublicId: ASSIGNEE,
      eventType: "ASSIGNED",
      eventCategory: "work_activity",
      sourceEntityType: "backlog_item",
      sourceEntityPublicId: ITEM,
      projectPublicId: PROJ,
      sprintPublicId: null,
      boardColumnPublicId: null,
      title: "t",
      summary: "s",
      actorUserPublicId: ACTOR,
      actorDisplayName: "A",
      triggeredAt: new Date(),
      readAt: null,
      isRead: false,
      isResponsibilityRelated: true,
      isFollowingRelated: false,
      navigationTarget: {
        kind: "scrum_backlog_item",
        projectPublicId: PROJ,
        workItemPublicId: ITEM,
        sprintPublicId: null,
        boardColumnPublicId: null,
      },
      groupingKey: null,
      dedupeKey,
      resourceAvailability: "available",
      retentionExpiresAt: new Date(),
    })
    await fanout.onAssignmentDelta({
      workspacePublicId: WS,
      projectPublicId: PROJ,
      workItemPublicId: ITEM,
      actorUserPublicId: ACTOR,
      previousAssigneeUserPublicId: null,
      nextAssigneeUserPublicId: ASSIGNEE,
      itemTitle: "Historia",
      assignmentEventId: "same",
      at: new Date(),
    })
    assert.equal(notifyRepo.rows.filter((r) => r.recipientUserPublicId === ASSIGNEE && r.eventType === "ASSIGNED").length, 1)
  })

  it("KANBAN_COLUMN_MOVED bursts merge within 30s (same actor + type)", async () => {
    const t0 = new Date()
    const t1 = new Date(t0.getTime() + 10_000)
    await fanout.onKanbanColumnMoved({
      workspacePublicId: WS,
      projectPublicId: PROJ,
      workItemPublicId: ITEM,
      itemTitle: "Historia",
      assigneeUserPublicId: ASSIGNEE,
      actorUserPublicId: ACTOR,
      fromColumnName: "A",
      toColumnName: "B",
      operationDedupeSecond: 1,
      toColumnPublicId: "col-b",
      at: t0,
    })
    await fanout.onKanbanColumnMoved({
      workspacePublicId: WS,
      projectPublicId: PROJ,
      workItemPublicId: ITEM,
      itemTitle: "Historia",
      assigneeUserPublicId: ASSIGNEE,
      actorUserPublicId: ACTOR,
      fromColumnName: "B",
      toColumnName: "C",
      operationDedupeSecond: 2,
      toColumnPublicId: "col-c",
      at: t1,
    })
    assert.equal(notifyRepo.rows.filter((r) => r.recipientUserPublicId === ASSIGNEE).length, 1)
    assert.equal(notifyRepo.rows[0]!.triggeredAt.getTime(), t1.getTime())
  })

  it("sprint board column move sin cambio de estado usa columnas en español", async () => {
    await fanout.onSprintBoardColumnMovedWithoutStatusChange({
      workspacePublicId: WS,
      projectPublicId: PROJ,
      sprintPublicId: randomUUID(),
      workItemPublicId: ITEM,
      itemTitle: "Como usuario necesito poder autenticar",
      assigneeUserPublicId: ASSIGNEE,
      actorUserPublicId: ACTOR,
      previousColumn: "in_progress",
      targetColumn: "in_review",
      backlogStatus: "in_progress",
      operationDedupeId: randomUUID(),
      at: new Date(),
    })
    const n = notifyRepo.rows.find((r) => r.recipientUserPublicId === ASSIGNEE)
    assert.ok(n)
    assert.equal(n!.title, "Cambio de columna en el sprint")
    assert.equal(
      n!.summary,
      "Actor movió «Como usuario necesito poder autenticar» de «En progreso» a «En revisión».",
    )
  })

  it("list scope mine/following/unread + mark read idempotent + mark all", async () => {
    const at = new Date()
    await notifyRepo.insert({
      notificationPublicId: "n1",
      workspacePublicId: WS,
      recipientUserPublicId: ASSIGNEE,
      eventType: "COMMENT_ADDED",
      eventCategory: "work_activity",
      sourceEntityType: "backlog_item",
      sourceEntityPublicId: ITEM,
      projectPublicId: PROJ,
      sprintPublicId: null,
      boardColumnPublicId: null,
      title: "t",
      summary: "s",
      actorUserPublicId: ACTOR,
      actorDisplayName: "A",
      triggeredAt: at,
      readAt: null,
      isRead: false,
      isResponsibilityRelated: true,
      isFollowingRelated: true,
      navigationTarget: {
        kind: "scrum_backlog_item",
        projectPublicId: PROJ,
        workItemPublicId: ITEM,
        sprintPublicId: null,
        boardColumnPublicId: null,
      },
      groupingKey: null,
      dedupeKey: "k1",
      resourceAvailability: "available",
      retentionExpiresAt: new Date(at.getTime() + 90 * 86400000),
    })
    const { items: all } = await query.listForUser({
      recipientUserPublicId: ASSIGNEE,
      scope: "all",
      limit: 50,
      daysWindow: 30,
      cursorRaw: undefined,
    })
    assert.equal(all.length, 1)
    const { items: mine } = await query.listForUser({
      recipientUserPublicId: ASSIGNEE,
      scope: "mine",
      limit: 50,
      daysWindow: 30,
      cursorRaw: undefined,
    })
    assert.equal(mine.length, 1)
    const { items: following } = await query.listForUser({
      recipientUserPublicId: ASSIGNEE,
      scope: "following",
      limit: 50,
      daysWindow: 30,
      cursorRaw: undefined,
    })
    assert.equal(following.length, 1)
    const { count: c0 } = await query.unreadCountForUser({ recipientUserPublicId: ASSIGNEE, daysWindow: 30 })
    assert.equal(c0, 1)
    await query.markOneRead({ recipientUserPublicId: ASSIGNEE, notificationPublicId: "n1" })
    await query.markOneRead({ recipientUserPublicId: ASSIGNEE, notificationPublicId: "n1" })
    const { count: c1 } = await query.unreadCountForUser({ recipientUserPublicId: ASSIGNEE, daysWindow: 30 })
    assert.equal(c1, 0)
    await notifyRepo.insert({
      notificationPublicId: "n2",
      workspacePublicId: WS,
      recipientUserPublicId: ASSIGNEE,
      eventType: "UNASSIGNED",
      eventCategory: "work_activity",
      sourceEntityType: "backlog_item",
      sourceEntityPublicId: ITEM,
      projectPublicId: PROJ,
      sprintPublicId: null,
      boardColumnPublicId: null,
      title: "t2",
      summary: "s2",
      actorUserPublicId: ACTOR,
      actorDisplayName: "A",
      triggeredAt: at,
      readAt: null,
      isRead: false,
      isResponsibilityRelated: false,
      isFollowingRelated: true,
      navigationTarget: {
        kind: "scrum_backlog_item",
        projectPublicId: PROJ,
        workItemPublicId: ITEM,
        sprintPublicId: null,
        boardColumnPublicId: null,
      },
      groupingKey: null,
      dedupeKey: "k2",
      resourceAvailability: "available",
      retentionExpiresAt: new Date(at.getTime() + 90 * 86400000),
    })
    const { updated } = await query.markAllRead({ recipientUserPublicId: ASSIGNEE, daysWindow: 30 })
    assert.equal(updated, 1)
  })

  it("missing backlog item degrades payload in list DTO", async () => {
    backlog.item = null
    const at = new Date()
    await notifyRepo.insert({
      notificationPublicId: "n3",
      workspacePublicId: WS,
      recipientUserPublicId: ASSIGNEE,
      eventType: "COMMENT_ADDED",
      eventCategory: "work_activity",
      sourceEntityType: "work_item_comment",
      sourceEntityPublicId: randomUUID(),
      projectPublicId: PROJ,
      sprintPublicId: null,
      boardColumnPublicId: null,
      title: "t",
      summary: "secret",
      actorUserPublicId: ACTOR,
      actorDisplayName: "A",
      triggeredAt: at,
      readAt: null,
      isRead: false,
      isResponsibilityRelated: false,
      isFollowingRelated: true,
      navigationTarget: {
        kind: "scrum_backlog_item",
        projectPublicId: PROJ,
        workItemPublicId: ITEM,
        sprintPublicId: null,
        boardColumnPublicId: null,
      },
      groupingKey: null,
      dedupeKey: "k3",
      resourceAvailability: "available",
      retentionExpiresAt: new Date(at.getTime() + 90 * 86400000),
    })
    const { items } = await query.listForUser({
      recipientUserPublicId: ASSIGNEE,
      scope: "all",
      limit: 50,
      daysWindow: 30,
      cursorRaw: undefined,
    })
    assert.equal(items[0]!.resourceAvailability, "unavailable")
    assert.ok(!items[0]!.summary.includes("secret"))
  })

  it("guided retro action ASSIGNED notifies assignee with navigation target", async () => {
    const actionId = "e0000000-0000-4000-8000-00000000abcd"
    await fanout.onGuidedRetroActionAssigned({
      workspacePublicId: WS,
      projectPublicId: PROJ,
      actionItemPublicId: actionId,
      actorUserPublicId: ACTOR,
      assigneeUserPublicId: ASSIGNEE,
      actionTitle: "Mejorar CI",
      assignmentEventId: "evt-retro-1",
      at: new Date(),
    })
    const n = notifyRepo.rows.find(
      (r) => r.recipientUserPublicId === ASSIGNEE && r.sourceEntityType === "guided_retro_action_item",
    )
    assert.ok(n)
    assert.equal(n!.eventType, "ASSIGNED")
    assert.equal(n!.navigationTarget.kind, "guided_retro_action")
    if (n!.navigationTarget.kind === "guided_retro_action") {
      assert.equal(n!.navigationTarget.actionItemPublicId, actionId)
    }
    const { items } = await query.listForUser({
      recipientUserPublicId: ASSIGNEE,
      scope: "all",
      limit: 50,
      daysWindow: 30,
      cursorRaw: undefined,
    })
    const listed = items.find((i) => i.notificationPublicId === n!.notificationPublicId)
    assert.ok(listed)
    assert.equal(listed!.context.guidedRetroActionItemPublicId, actionId)
    assert.equal(listed!.context.workItemPublicId, null)
  })

  it("guided retro action self-assign skips notification", async () => {
    const before = notifyRepo.rows.length
    await fanout.onGuidedRetroActionAssigned({
      workspacePublicId: WS,
      projectPublicId: PROJ,
      actionItemPublicId: randomUUID(),
      actorUserPublicId: ASSIGNEE,
      assigneeUserPublicId: ASSIGNEE,
      actionTitle: "Solo",
      assignmentEventId: "evt-retro-2",
      at: new Date(),
    })
    assert.equal(notifyRepo.rows.length, before)
  })
})
