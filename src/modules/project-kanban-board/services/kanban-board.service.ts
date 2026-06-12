import { acceptanceCriteriaSummary } from "../../project-scrum-backlog/domain/acceptance-criterion.js"
import type { ScrumBacklogItemState } from "../../project-scrum-backlog/domain/scrum-backlog-item.js"
import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { ProjectKanbanFlowConfigState, KanbanWipEnforcement } from "../../project-kanban-core/domain/kanban-flow.js"
import type { KanbanFlowService } from "../../project-kanban-core/services/kanban-flow.service.js"
import type { KanbanBacklogService } from "../../project-kanban-backlog/services/kanban-backlog.service.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceAuditLogRepository } from "../../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import type { WorkReadyDoneControlsService } from "../../work-ready-done-controls/services/work-ready-done-controls.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type { WorkActivityNotificationFanoutService } from "../../work-activity-notifications/services/work-activity-notification-fanout.service.js"
import { KANBAN_BOARD_BLOCKED_REASON_MAX_LENGTH } from "../domain/kanban-board.constants.js"
import { checkKanbanWipMove } from "../../project-kanban-wip-limits/domain/kanban-wip-evaluation.js"
import { canKanbanWipOverrideRole } from "../../project-kanban-wip-limits/policies/kanban-wip-authorization.policy.js"
import {
  KanbanBoardNotFoundError,
  KanbanBoardValidationError,
  KanbanBoardWipLimitBlockedError,
  KanbanBoardWipMoveAckRequiredError,
  KanbanWipOverrideForbiddenError,
} from "../domain/kanban-board.errors.js"
import {
  assertCanBlockKanbanBoardItems,
  assertCanMoveKanbanBoardItem,
  assertCanReadKanbanBoard,
} from "../policies/kanban-board-authorization.policy.js"

export type KanbanBoardCardSnapshotDto = {
  backlogItemPublicId: string
  itemType: ScrumBacklogItemState["itemType"]
  title: string
  columnPublicId: string
  isBlocked: boolean
  blockedReason: string | null
  assignment: {
    assignedUserPublicId: string | null
    assignmentUpdatedAt: string | null
  }
  priorityLevel: ScrumBacklogItemState["priorityLevel"]
  storyPoints: number | null
  acceptanceCriteriaSummary: ReturnType<typeof acceptanceCriteriaSummary>
  commentsCount: number
}

export type KanbanBoardSnapshotColumnDto = {
  columnPublicId: string
  name: string
  position: number
  wipLimit: number | null
  policyText: string
  wipEnforcement: KanbanWipEnforcement
  cards: KanbanBoardCardSnapshotDto[]
  /** Presente cuando la petición incluye `itemsPerColumn`. */
  totalItems?: number
  hasMore?: boolean
}

export type KanbanBoardSnapshotDto = {
  columns: KanbanBoardSnapshotColumnDto[]
  flowUpdatedAt: string
}

export type KanbanBoardColumnItemsPageDto = {
  columnPublicId: string
  cards: KanbanBoardCardSnapshotDto[]
  totalItems: number
  hasMore: boolean
  nextOffset: number | null
  /** Keyset cursor (sort_order + public_id) cuando la petición usa `afterSortOrder`/`afterPublicId`. */
  nextCursor: { sortOrder: number; backlogItemPublicId: string } | null
}

function normalizeBlockedReason(raw: string | undefined | null): string | null {
  if (raw === undefined || raw === null) return null
  const t = raw.trim()
  if (!t) return null
  return t.slice(0, KANBAN_BOARD_BLOCKED_REASON_MAX_LENGTH)
}

function itemToCardDto(item: ScrumBacklogItemState, columnPublicId: string): KanbanBoardCardSnapshotDto {
  return {
    backlogItemPublicId: item.backlogItemPublicId,
    itemType: item.itemType,
    title: item.title,
    columnPublicId,
    isBlocked: item.isBlocked === true,
    blockedReason: item.blockedReason,
    assignment: {
      assignedUserPublicId: item.assignedUserPublicId,
      assignmentUpdatedAt: item.assignmentUpdatedAt ? item.assignmentUpdatedAt.toISOString() : null,
    },
    priorityLevel: item.priorityLevel,
    storyPoints: item.storyPoints,
    acceptanceCriteriaSummary: acceptanceCriteriaSummary(item.acceptanceCriteria),
    commentsCount: item.commentsCount,
  }
}

function assertOnBoard(item: ScrumBacklogItemState): void {
  if (item.kanbanColumnPublicId === null) {
    throw new KanbanBoardValidationError("Item is not on the Kanban board.")
  }
}

export class KanbanBoardService {
  constructor(
    private readonly repo: ScrumBacklogRepository,
    private readonly projectRuntimeService: ProjectRuntimeService,
    private readonly kanbanFlowService: KanbanFlowService,
    private readonly kanbanBacklogService: KanbanBacklogService,
    private readonly auditLogRepository: WorkspaceAuditLogRepository | null = null,
    private readonly workControls: WorkReadyDoneControlsService | null = null,
    private readonly workActivityNotifications: WorkActivityNotificationFanoutService | null = null,
  ) {}

  async getBoardSnapshot(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    options?: { itemsPerColumn?: number },
  ): Promise<KanbanBoardSnapshotDto> {
    assertCanReadKanbanBoard(actor)
    await this.projectRuntimeService.requireKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const flow = await this.kanbanFlowService.getFlowConfigOrThrow(workspacePublicId, projectPublicId)
    const columnsSorted = flow.columns.slice().sort((a, b) => a.position - b.position)
    const limit =
      options?.itemsPerColumn !== undefined
        ? Math.min(100, Math.max(1, Math.floor(options.itemsPerColumn)))
        : null

    const columns: KanbanBoardSnapshotColumnDto[] =
      limit !== null
        ? await Promise.all(
            columnsSorted.map(async (col) => {
              const [totalItems, colItems] = await Promise.all([
                this.repo.countItemsInKanbanColumn(workspacePublicId, projectPublicId, col.columnPublicId),
                this.repo.listKanbanBoardItemsByColumn(workspacePublicId, projectPublicId, col.columnPublicId, {
                  skip: 0,
                  take: limit,
                }),
              ])
              return {
                columnPublicId: col.columnPublicId,
                name: col.name,
                position: col.position,
                wipLimit: col.wipLimit,
                policyText: col.policyText,
                wipEnforcement: col.wipEnforcement,
                cards: colItems.map((it) => itemToCardDto(it, col.columnPublicId)),
                totalItems,
                hasMore: totalItems > colItems.length,
              }
            }),
          )
        : await (async () => {
            const items = await this.repo.listKanbanBoardItems(workspacePublicId, projectPublicId)
            const byColumn = new Map<string, ScrumBacklogItemState[]>()
            for (const col of flow.columns) {
              byColumn.set(col.columnPublicId, [])
            }
            for (const item of items) {
              const colId = item.kanbanColumnPublicId
              if (!colId) continue
              const list = byColumn.get(colId)
              if (list) {
                list.push(item)
              }
            }
            return columnsSorted.map((col) => {
              const colItems = (byColumn.get(col.columnPublicId) ?? []).slice().sort((a, b) => {
                if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
                return a.createdAt.getTime() - b.createdAt.getTime()
              })
              return {
                columnPublicId: col.columnPublicId,
                name: col.name,
                position: col.position,
                wipLimit: col.wipLimit,
                policyText: col.policyText,
                wipEnforcement: col.wipEnforcement,
                cards: colItems.map((it) => itemToCardDto(it, col.columnPublicId)),
              }
            })
          })()
    return {
      columns,
      flowUpdatedAt: flow.updatedAt.toISOString(),
    }
  }

  async getColumnItemsPage(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    columnPublicId: string,
    offset: number,
    limit: number,
    cursor?: { afterSortOrder: number; afterPublicId: string },
  ): Promise<KanbanBoardColumnItemsPageDto> {
    assertCanReadKanbanBoard(actor)
    await this.projectRuntimeService.requireKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const flow = await this.kanbanFlowService.getFlowConfigOrThrow(workspacePublicId, projectPublicId)
    const column = flow.columns.find((c) => c.columnPublicId === columnPublicId)
    if (!column) {
      throw new KanbanBoardNotFoundError("Kanban column not found.")
    }
    const safeOffset = Math.max(0, Math.floor(offset))
    const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)))
    const useCursor = cursor !== undefined
    const [totalItems, items] = await Promise.all([
      this.repo.countItemsInKanbanColumn(workspacePublicId, projectPublicId, columnPublicId),
      this.repo.listKanbanBoardItemsByColumn(workspacePublicId, projectPublicId, columnPublicId, {
        skip: useCursor ? 0 : safeOffset,
        take: safeLimit,
        afterSortOrder: cursor?.afterSortOrder,
        afterPublicId: cursor?.afterPublicId,
      }),
    ])
    const nextOffset = safeOffset + items.length
    const last = items[items.length - 1]
    const hasMore = useCursor
      ? items.length === safeLimit && items.length < totalItems
      : nextOffset < totalItems
    const nextCursor =
      hasMore && last
        ? { sortOrder: last.sortOrder, backlogItemPublicId: last.backlogItemPublicId }
        : null
    return {
      columnPublicId,
      cards: items.map((it) => itemToCardDto(it, columnPublicId)),
      totalItems,
      hasMore,
      nextOffset: useCursor ? null : hasMore ? nextOffset : null,
      nextCursor,
    }
  }

  private async loadFlowAndItem(
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
  ): Promise<{ flow: ProjectKanbanFlowConfigState; item: ScrumBacklogItemState }> {
    await this.projectRuntimeService.requireKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const flow = await this.kanbanFlowService.getFlowConfigOrThrow(workspacePublicId, projectPublicId)
    const item = await this.repo.findByProjectAndItemId(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
    )
    if (!item) throw new KanbanBoardNotFoundError()
    return { flow, item }
  }

  async moveItemToColumn(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
    toColumnPublicId: string,
    options?: {
      /** @deprecated Reemplazado por `kanbanWipMoveAck` para `warning`. */
      allowWipOverride?: boolean
      kanbanWipMoveAck?: boolean
      kanbanWipOverrideReason?: string | null
      workControlOverrideToken?: string | null
    },
  ): Promise<ScrumBacklogItemState> {
    assertCanMoveKanbanBoardItem(actor)
    const { flow, item } = await this.loadFlowAndItem(workspacePublicId, projectPublicId, backlogItemPublicId)
    assertOnBoard(item)

    const fromColumnId = item.kanbanColumnPublicId!
    if (fromColumnId === toColumnPublicId) {
      throw new KanbanBoardValidationError("Item is already in the target column.")
    }
    const toCol = this.kanbanFlowService.findColumnByPublicId(flow, toColumnPublicId)
    if (!toCol) {
      throw new KanbanBoardValidationError("Target column is not part of this Kanban flow.")
    }
    if (!this.kanbanFlowService.findColumnByPublicId(flow, fromColumnId)) {
      throw new KanbanBoardValidationError("Current column is not part of this Kanban flow.")
    }

    const inDest = await this.repo.countItemsInKanbanColumn(workspacePublicId, projectPublicId, toColumnPublicId)
    const hasMoveAck = options?.kanbanWipMoveAck === true || options?.allowWipOverride === true
    const overrideReason = (options?.kanbanWipOverrideReason ?? "").trim() || null
    const g = checkKanbanWipMove(
      toCol,
      inDest,
      hasMoveAck,
      overrideReason,
      canKanbanWipOverrideRole(actor),
    )
    if (g.outcome === "need_ack") {
      const p = g.payload
      throw new KanbanBoardWipMoveAckRequiredError(
        "Move would reach or exceed the WIP limit under warning policy. Retry with kanban_wip_move_ack: true.",
        {
          currentCount: p.current_count,
          wipLimit: p.limit,
          toColumnPublicId: p.to_column_public_id,
          policy: p.policy,
          projectedCountAfterMove: p.projected_count_after_move,
        },
      )
    }
    if (g.outcome === "wip_blocked") {
      const p = g.payload
      throw new KanbanBoardWipLimitBlockedError(
        "Move is blocked by WIP policy. Retry with kanban_wip_override_reason and an authorized role, or wait for capacity.",
        {
          currentCount: p.current_count,
          wipLimit: p.limit,
          toColumnPublicId: p.to_column_public_id,
          policy: p.policy,
          projectedCountAfterMove: p.projected_count_after_move,
        },
      )
    }
    if (g.outcome === "override_forbidden") {
      throw new KanbanWipOverrideForbiddenError()
    }

    const usedWipOverride = toCol.wipEnforcement === "blocking" && toCol.wipLimit !== null && inDest + 1 > toCol.wipLimit && overrideReason !== null

    if (this.workControls) {
      await this.workControls.assertMayMoveKanbanToColumn({
        workspacePublicId,
        projectPublicId,
        flow,
        item,
        toColumnPublicId,
        actor,
        overrideToken: options?.workControlOverrideToken ?? null,
      })
    }

    const boardItems = await this.repo.listKanbanBoardItems(workspacePublicId, projectPublicId)
    const inTarget = boardItems.filter((i) => i.kanbanColumnPublicId === toColumnPublicId)
    const maxOrder = inTarget.length > 0 ? Math.max(...inTarget.map((i) => i.sortOrder)) : -1
    const now = new Date()
    const next: ScrumBacklogItemState = {
      ...item,
      kanbanColumnPublicId: toColumnPublicId,
      sortOrder: maxOrder + 1,
      updatedAt: now,
    }
    await this.repo.replace(next)

    if (this.auditLogRepository) {
      await this.auditLogRepository.append({
        workspacePublicId,
        category: "kanban_board_item",
        action: "moved_between_columns",
        actorUserPublicId: actor.userPublicId,
        occurredAt: now,
        resource: { projectPublicId, backlogItemPublicId },
        previousValue: {
          fromColumnPublicId: fromColumnId,
          toColumnPublicId,
          wipOverride: usedWipOverride,
        },
        nextValue: {
          toColumnPublicId,
          toColumnName: toCol.name,
        },
      })
      if (usedWipOverride && overrideReason) {
        await this.auditLogRepository.append({
          workspacePublicId,
          category: "kanban_wip",
          action: "wip_move_override_applied",
          actorUserPublicId: actor.userPublicId,
          occurredAt: now,
          resource: { projectPublicId, backlogItemPublicId },
          previousValue: { toColumnPublicId, currentCount: inDest, wipLimit: toCol.wipLimit },
          nextValue: {
            toColumnPublicId,
            reason: overrideReason,
            policy: toCol.wipEnforcement,
            projectedCountAfterMove: inDest + 1,
          },
        })
      }
    }

    const persisted = await this.repo.findByProjectAndItemId(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
    )
    if (!persisted) throw new KanbanBoardNotFoundError()

    if (this.workActivityNotifications) {
      const fromCol = this.kanbanFlowService.findColumnByPublicId(flow, fromColumnId)
      const opSecond = Math.floor(now.getTime() / 1000)
      void this.workActivityNotifications
        .onKanbanColumnMoved({
          workspacePublicId,
          projectPublicId,
          workItemPublicId: backlogItemPublicId,
          itemTitle: persisted.title,
          assigneeUserPublicId: persisted.assignedUserPublicId,
          actorUserPublicId: actor.userPublicId,
          fromColumnName: fromCol?.name ?? fromColumnId,
          toColumnName: toCol.name,
          operationDedupeSecond: opSecond,
          toColumnPublicId,
          at: now,
        })
        .catch((e) => {
          console.error("[work-activity-notifications] fanout failed", e)
        })
    }

    return persisted
  }

  /**
   * Reordena un ítem **dentro de la misma columna** Kanban (no dispara DoR/DoD; no cambia columna ni status de backlog).
   */
  async reorderItemWithinColumn(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
    columnPublicId: string,
    placedBeforeBacklogItemPublicId: string | null,
  ): Promise<ScrumBacklogItemState> {
    assertCanMoveKanbanBoardItem(actor)
    const { flow, item } = await this.loadFlowAndItem(workspacePublicId, projectPublicId, backlogItemPublicId)
    assertOnBoard(item)
    const fromColumnId = item.kanbanColumnPublicId!
    if (fromColumnId !== columnPublicId) {
      throw new KanbanBoardValidationError("Item is not in the given column; use move to change column.")
    }
    if (!this.kanbanFlowService.findColumnByPublicId(flow, columnPublicId)) {
      throw new KanbanBoardValidationError("Column is not part of this Kanban flow.")
    }

    const boardItems = await this.repo.listKanbanBoardItems(workspacePublicId, projectPublicId)
    const inColumn = boardItems
      .filter((i) => i.kanbanColumnPublicId === columnPublicId)
      .sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
        return a.createdAt.getTime() - b.createdAt.getTime()
      })
    const orderedIds = inColumn.map((i) => i.backlogItemPublicId)
    const without = orderedIds.filter((id) => id !== backlogItemPublicId)
    let insertAt = without.length
    if (placedBeforeBacklogItemPublicId !== null) {
      const idx = without.indexOf(placedBeforeBacklogItemPublicId)
      if (idx === -1) {
        throw new KanbanBoardValidationError(
          "placed_before_backlog_item_public_id is not in this column or is the item being moved.",
        )
      }
      insertAt = idx
    }
    const nextIds = [...without.slice(0, insertAt), backlogItemPublicId, ...without.slice(insertAt)]
    if (nextIds.length === orderedIds.length && nextIds.every((id, i) => id === orderedIds[i])) {
      return item
    }
    const now = new Date()
    const bulk = nextIds.map((id, sortOrder) => ({ backlogItemPublicId: id, sortOrder, updatedAt: now }))
    await this.repo.bulkSetSortOrders(workspacePublicId, projectPublicId, bulk)
    if (this.auditLogRepository) {
      await this.auditLogRepository.append({
        workspacePublicId,
        category: "kanban_board_item",
        action: "reordered_in_column",
        actorUserPublicId: actor.userPublicId,
        occurredAt: now,
        resource: { projectPublicId, backlogItemPublicId },
        previousValue: { columnPublicId, order: orderedIds },
        nextValue: { columnPublicId, order: nextIds },
      })
    }
    const persisted = await this.repo.findByProjectAndItemId(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
    )
    if (!persisted) throw new KanbanBoardNotFoundError()
    return persisted
  }

  async blockItem(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
    input?: { blockedReason?: string | null },
  ): Promise<ScrumBacklogItemState> {
    assertCanBlockKanbanBoardItems(actor)
    const { item } = await this.loadFlowAndItem(workspacePublicId, projectPublicId, backlogItemPublicId)
    assertOnBoard(item)

    const reason = normalizeBlockedReason(input?.blockedReason ?? undefined)
    const now = new Date()
    const wasBlocked = item.isBlocked === true
    const next: ScrumBacklogItemState = {
      ...item,
      isBlocked: true,
      blockedReason: reason ?? item.blockedReason,
      updatedAt: now,
    }
    await this.repo.replace(next)

    if (this.auditLogRepository) {
      await this.auditLogRepository.append({
        workspacePublicId,
        category: "kanban_board_item",
        action: "blocked",
        actorUserPublicId: actor.userPublicId,
        occurredAt: now,
        resource: { projectPublicId, backlogItemPublicId },
        previousValue: { isBlocked: wasBlocked, blockedReason: item.blockedReason },
        nextValue: { isBlocked: true, blockedReason: next.blockedReason },
      })
    }

    const persisted = await this.repo.findByProjectAndItemId(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
    )
    if (!persisted) throw new KanbanBoardNotFoundError()

    if (this.workActivityNotifications && !wasBlocked) {
      const opSecond = Math.floor(now.getTime() / 1000)
      void this.workActivityNotifications
        .onBlockToggled({
          workspacePublicId,
          projectPublicId,
          workItemPublicId: backlogItemPublicId,
          itemTitle: persisted.title,
          assigneeUserPublicId: persisted.assignedUserPublicId,
          actorUserPublicId: actor.userPublicId,
          blocked: true,
          reason: persisted.blockedReason,
          operationDedupeSecond: opSecond,
          at: now,
        })
        .catch((e) => {
          console.error("[work-activity-notifications] fanout failed", e)
        })
    }

    return persisted
  }

  async unblockItem(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
  ): Promise<ScrumBacklogItemState> {
    assertCanBlockKanbanBoardItems(actor)
    const { item } = await this.loadFlowAndItem(workspacePublicId, projectPublicId, backlogItemPublicId)
    assertOnBoard(item)

    if (!item.isBlocked) {
      return item
    }

    const now = new Date()
    const next: ScrumBacklogItemState = {
      ...item,
      isBlocked: false,
      blockedReason: null,
      updatedAt: now,
    }
    await this.repo.replace(next)

    if (this.auditLogRepository) {
      await this.auditLogRepository.append({
        workspacePublicId,
        category: "kanban_board_item",
        action: "unblocked",
        actorUserPublicId: actor.userPublicId,
        occurredAt: now,
        resource: { projectPublicId, backlogItemPublicId },
        previousValue: { isBlocked: true, blockedReason: item.blockedReason },
        nextValue: { isBlocked: false, blockedReason: null },
      })
    }

    const persisted = await this.repo.findByProjectAndItemId(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
    )
    if (!persisted) throw new KanbanBoardNotFoundError()

    if (this.workActivityNotifications) {
      const opSecond = Math.floor(now.getTime() / 1000)
      void this.workActivityNotifications
        .onBlockToggled({
          workspacePublicId,
          projectPublicId,
          workItemPublicId: backlogItemPublicId,
          itemTitle: persisted.title,
          assigneeUserPublicId: persisted.assignedUserPublicId,
          actorUserPublicId: actor.userPublicId,
          blocked: false,
          reason: null,
          operationDedupeSecond: opSecond,
          at: now,
        })
        .catch((e) => {
          console.error("[work-activity-notifications] fanout failed", e)
        })
    }

    return persisted
  }

  async updateBlockedReason(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
    blockedReason: string,
  ): Promise<ScrumBacklogItemState> {
    assertCanBlockKanbanBoardItems(actor)
    const { item } = await this.loadFlowAndItem(workspacePublicId, projectPublicId, backlogItemPublicId)
    assertOnBoard(item)
    if (!item.isBlocked) {
      throw new KanbanBoardValidationError("Item is not blocked.")
    }

    const reason = normalizeBlockedReason(blockedReason)
    if (reason === null) {
      throw new KanbanBoardValidationError("blocked_reason cannot be empty when updating.")
    }

    const now = new Date()
    const prevReason = item.blockedReason
    const next: ScrumBacklogItemState = {
      ...item,
      blockedReason: reason,
      updatedAt: now,
    }
    await this.repo.replace(next)

    if (this.auditLogRepository && prevReason !== reason) {
      await this.auditLogRepository.append({
        workspacePublicId,
        category: "kanban_board_item",
        action: "blocked",
        actorUserPublicId: actor.userPublicId,
        occurredAt: now,
        resource: { projectPublicId, backlogItemPublicId },
        previousValue: { blockedReason: prevReason },
        nextValue: { blockedReason: reason },
      })
    }

    const persisted = await this.repo.findByProjectAndItemId(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
    )
    if (!persisted) throw new KanbanBoardNotFoundError()
    return persisted
  }

  /**
   * Misma política y evento `returned_to_backlog` que `KanbanBacklogService` (frontera backlog ↔ flujo).
   */
  returnItemFromBoardToBacklog(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
  ): Promise<ScrumBacklogItemState> {
    return this.kanbanBacklogService.returnItemToBacklog(
      actor,
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
    )
  }
}
