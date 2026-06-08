import { randomUUID } from "node:crypto"
import type { ScrumBacklogItemPriorityLevel } from "../../project-scrum-backlog/domain/backlog-item-priority-level.js"
import type { ScrumBacklogItemStatus } from "../../project-scrum-backlog/domain/backlog-item-status.js"
import type { ScrumBacklogItemType } from "../../project-scrum-backlog/domain/backlog-item-type.js"
import type { ScrumBacklogItemState } from "../../project-scrum-backlog/domain/scrum-backlog-item.js"
import {
  assertAcceptanceCriteriaChangesAllowed,
  assertCanPatchAcceptanceCriteriaOnly,
} from "../../project-scrum-backlog/domain/scrum-backlog-acceptance-criteria.policy.js"
import {
  mergeAcceptanceCriteriaFromPatch,
  type AcceptanceCriterionPatchInput,
} from "../../project-scrum-backlog/domain/scrum-backlog-acceptance-criteria.validation.js"
import { assertStoryPointsValueForItemType } from "../../project-scrum-backlog/domain/scrum-backlog-operational-fields.policy.js"
import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { KanbanFlowService } from "../../project-kanban-core/services/kanban-flow.service.js"
import type { WorkReadyDoneControlsService } from "../../work-ready-done-controls/services/work-ready-done-controls.service.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceAuditLogRepository } from "../../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type { WorkActivityNotificationFanoutService } from "../../work-activity-notifications/services/work-activity-notification-fanout.service.js"
import type { WorkItemAssignmentListFilter } from "../../work-item-assignment/utils/work-item-assignment-list-filter.util.js"
import { applyWorkItemAssignmentListFilter } from "../../work-item-assignment/utils/work-item-assignment-list-filter.util.js"
import {
  assertKanbanBacklogCreateItemType,
  assertKanbanItemReleasableToFlow,
  isKanbanBacklogListRow,
  isKanbanTopLevelWorkItem,
} from "../domain/kanban-backlog-eligibility.policy.js"
import {
  KanbanBoardWipLimitBlockedError,
  KanbanBoardWipMoveAckRequiredError,
  KanbanWipOverrideForbiddenError,
} from "../../project-kanban-board/domain/kanban-board.errors.js"
import { checkKanbanWipMove } from "../../project-kanban-wip-limits/domain/kanban-wip-evaluation.js"
import { canKanbanWipOverrideRole } from "../../project-kanban-wip-limits/policies/kanban-wip-authorization.policy.js"
import {
  KanbanBacklogNotFoundError,
  KanbanBacklogValidationError,
} from "../domain/kanban-backlog.errors.js"
import {
  assertCanMutateKanbanBacklogContent,
  assertCanRankKanbanBacklog,
  assertCanReadKanbanBacklog,
  assertCanReleaseToFlow,
} from "../policies/kanban-backlog-authorization.policy.js"
import { assertCanReturnKanbanBoardItemsToBacklog } from "../../project-kanban-board/policies/kanban-board-authorization.policy.js"

export type CreateKanbanBacklogItemInput = {
  itemType: ScrumBacklogItemType
  title: string
  description: string
  status?: ScrumBacklogItemStatus
  storyPoints?: number | null
  priorityLevel?: ScrumBacklogItemPriorityLevel
  acceptanceCriteria?: AcceptanceCriterionPatchInput[]
}

export type PatchKanbanBacklogItemInput = {
  title?: string
  description?: string
  status?: ScrumBacklogItemStatus
  storyPoints?: number | null
  priorityLevel?: ScrumBacklogItemPriorityLevel
  acceptanceCriteria?: AcceptanceCriterionPatchInput[]
}

export class KanbanBacklogService {
  constructor(
    private readonly repo: ScrumBacklogRepository,
    private readonly projectRuntimeService: ProjectRuntimeService,
    private readonly kanbanFlowService: KanbanFlowService,
    private readonly auditLogRepository: WorkspaceAuditLogRepository | null = null,
    private readonly workControls: WorkReadyDoneControlsService | null = null,
    private readonly workActivityNotifications: WorkActivityNotificationFanoutService | null = null,
  ) {}

  async listKanbanBacklog(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    options?: { search?: string; assignmentFilter?: WorkItemAssignmentListFilter },
  ): Promise<ScrumBacklogItemState[]> {
    assertCanReadKanbanBacklog(actor)
    await this.projectRuntimeService.requireKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    await this.kanbanFlowService.getFlowConfigOrThrow(workspacePublicId, projectPublicId)
    const items = await this.repo.listKanbanBacklogItems(workspacePublicId, projectPublicId, {
      search: options?.search,
    })
    return applyWorkItemAssignmentListFilter(items, actor, options?.assignmentFilter)
  }

  async getKanbanBacklogItem(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
  ): Promise<ScrumBacklogItemState> {
    assertCanReadKanbanBacklog(actor)
    await this.projectRuntimeService.requireKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    await this.kanbanFlowService.getFlowConfigOrThrow(workspacePublicId, projectPublicId)
    const row = await this.repo.findByProjectAndItemId(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
    )
    if (!row) throw new KanbanBacklogNotFoundError()
    if (!isKanbanTopLevelWorkItem(row)) {
      throw new KanbanBacklogValidationError("Item is not a top-level Kanban work item.")
    }
    return row
  }

  async createKanbanBacklogItem(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    input: CreateKanbanBacklogItemInput,
  ): Promise<ScrumBacklogItemState> {
    assertCanMutateKanbanBacklogContent(actor)
    await this.projectRuntimeService.requireKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    await this.kanbanFlowService.getFlowConfigOrThrow(workspacePublicId, projectPublicId)

    assertKanbanBacklogCreateItemType(input.itemType)

    const storyPoints = input.storyPoints !== undefined ? input.storyPoints : null
    assertStoryPointsValueForItemType(input.itemType, storyPoints)
    const priorityLevel: ScrumBacklogItemPriorityLevel = input.priorityLevel ?? "none"
    const now = new Date()
    const acceptanceCriteria =
      input.acceptanceCriteria !== undefined && input.acceptanceCriteria.length > 0
        ? mergeAcceptanceCriteriaFromPatch(input.itemType, [], input.acceptanceCriteria, now)
        : []

    const sortOrder = (await this.repo.maxSortOrderKanbanBacklog(workspacePublicId, projectPublicId)) + 1

    const state: ScrumBacklogItemState = {
      backlogItemPublicId: randomUUID(),
      workspacePublicId,
      projectPublicId,
      itemType: input.itemType,
      title: input.title.trim().slice(0, 500),
      description: input.description.trim().slice(0, 8000),
      status: input.status ?? "open",
      sortOrder,
      parentItemPublicId: null,
      createdByUserPublicId: actor.userPublicId,
      createdAt: now,
      updatedAt: now,
      completedInSprintPublicId: null,
      assignedUserPublicId: null,
      assignmentUpdatedAt: null,
      assignmentUpdatedByUserPublicId: null,
      assignmentHistory: [],
      storyPoints,
      priorityLevel,
      acceptanceCriteria,
      commentsCount: 0,
      kanbanColumnPublicId: null,
      isBlocked: false,
      blockedReason: null,
    }

    if (!state.title) {
      throw new KanbanBacklogValidationError("Title cannot be empty.")
    }

    await this.repo.insert(state)
    const persisted = await this.repo.findByProjectAndItemId(
      workspacePublicId,
      projectPublicId,
      state.backlogItemPublicId,
    )
    if (!persisted) {
      throw new Error("kanban_backlog_insert_missing_after_create")
    }
    return persisted
  }

  async updateKanbanBacklogItem(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
    patch: PatchKanbanBacklogItemInput,
  ): Promise<ScrumBacklogItemState> {
    await this.projectRuntimeService.requireKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    await this.kanbanFlowService.getFlowConfigOrThrow(workspacePublicId, projectPublicId)

    const keys = Object.keys(patch) as (keyof PatchKanbanBacklogItemInput)[]
    if (keys.length === 0) {
      throw new KanbanBacklogValidationError("No fields to update.")
    }

    const onlyAcceptanceCriteria = keys.length === 1 && keys[0] === "acceptanceCriteria"
    if (onlyAcceptanceCriteria) {
      assertCanPatchAcceptanceCriteriaOnly(actor)
    } else {
      assertCanMutateKanbanBacklogContent(actor)
    }

    const current = await this.repo.findByProjectAndItemId(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
    )
    if (!current) throw new KanbanBacklogNotFoundError()
    if (!isKanbanTopLevelWorkItem(current)) {
      throw new KanbanBacklogValidationError("Item is not a top-level Kanban work item.")
    }

    const now = new Date()
    let nextAcceptanceCriteria = current.acceptanceCriteria
    if (patch.acceptanceCriteria !== undefined) {
      const merged = mergeAcceptanceCriteriaFromPatch(
        current.itemType,
        current.acceptanceCriteria,
        patch.acceptanceCriteria,
        now,
      )
      if (onlyAcceptanceCriteria) {
        assertAcceptanceCriteriaChangesAllowed(actor, current.acceptanceCriteria, merged, false)
      }
      nextAcceptanceCriteria = merged
    }

    let nextStoryPoints = current.storyPoints ?? null
    if (patch.storyPoints !== undefined) {
      assertStoryPointsValueForItemType(current.itemType, patch.storyPoints)
      nextStoryPoints = patch.storyPoints
    }

    let nextPriorityLevel = current.priorityLevel
    if (patch.priorityLevel !== undefined) {
      nextPriorityLevel = patch.priorityLevel
    }

    const next: ScrumBacklogItemState = {
      ...current,
      title: patch.title !== undefined ? patch.title.trim().slice(0, 500) : current.title,
      description:
        patch.description !== undefined ? patch.description.trim().slice(0, 8000) : current.description,
      status: patch.status !== undefined ? patch.status : current.status,
      storyPoints: nextStoryPoints,
      priorityLevel: nextPriorityLevel,
      acceptanceCriteria: nextAcceptanceCriteria,
      updatedAt: now,
    }

    if (!next.title) {
      throw new KanbanBacklogValidationError("Title cannot be empty.")
    }

    await this.repo.replace(next)

    if (
      this.workActivityNotifications &&
      patch.status !== undefined &&
      patch.status !== current.status
    ) {
      const operationDedupeId = randomUUID()
      void this.workActivityNotifications
        .onScrumLikeStatusChanged({
          workspacePublicId,
          projectPublicId,
          workItemPublicId: backlogItemPublicId,
          itemTitle: next.title,
          assigneeUserPublicId: next.assignedUserPublicId,
          previousStatus: current.status,
          nextStatus: next.status,
          actorUserPublicId: actor.userPublicId,
          operationDedupeId,
          sprintPublicId: null,
          boardColumnPublicId: null,
          at: now,
        })
        .catch((e) => {
          console.error("[work-activity-notifications] fanout failed", e)
        })
    }

    const persisted = await this.repo.findByProjectAndItemId(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
    )
    if (!persisted) throw new KanbanBacklogNotFoundError()
    return persisted
  }

  async reorderKanbanBacklog(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    orderedBacklogItemPublicIds: string[],
  ): Promise<ScrumBacklogItemState[]> {
    assertCanRankKanbanBacklog(actor)
    await this.projectRuntimeService.requireKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    await this.kanbanFlowService.getFlowConfigOrThrow(workspacePublicId, projectPublicId)

    const current = await this.repo.listKanbanBacklogItems(workspacePublicId, projectPublicId)
    const currentIds = new Set(current.map((i) => i.backlogItemPublicId))
    const orderedSet = new Set(orderedBacklogItemPublicIds)

    if (orderedBacklogItemPublicIds.length !== orderedSet.size) {
      throw new KanbanBacklogValidationError("Duplicate ids in orderedBacklogItemPublicIds.")
    }
    if (currentIds.size !== orderedSet.size || ![...currentIds].every((id) => orderedSet.has(id))) {
      throw new KanbanBacklogValidationError(
        "orderedBacklogItemPublicIds must list every Kanban backlog item exactly once.",
      )
    }

    const now = new Date()
    const updates = orderedBacklogItemPublicIds.map((backlogItemPublicId, i) => ({
      backlogItemPublicId,
      sortOrder: i,
      updatedAt: now,
    }))
    await this.repo.bulkSetSortOrders(workspacePublicId, projectPublicId, updates)
    return this.repo.listKanbanBacklogItems(workspacePublicId, projectPublicId)
  }

  async releaseItemToFlow(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
    options?: {
      allowWipOverride?: boolean
      kanbanWipMoveAck?: boolean
      kanbanWipOverrideReason?: string | null
      workControlOverrideToken?: string | null
    },
  ): Promise<ScrumBacklogItemState> {
    assertCanReleaseToFlow(actor)
    await this.projectRuntimeService.requireKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const flow = await this.kanbanFlowService.getFlowConfigOrThrow(workspacePublicId, projectPublicId)

    const entryColumnPublicId = flow.entryColumnPublicId
    const entryColumn = this.kanbanFlowService.findColumnByPublicId(flow, entryColumnPublicId)
    if (!entryColumn) {
      throw new KanbanBacklogValidationError("Kanban flow entry column is not configured for this project.")
    }

    const item = await this.repo.findByProjectAndItemId(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
    )
    if (!item) throw new KanbanBacklogNotFoundError()
    if (!isKanbanBacklogListRow(item)) {
      throw new KanbanBacklogValidationError("Only backlog items can be released to the flow.")
    }
    assertKanbanItemReleasableToFlow(item.itemType)

    const inEntry = await this.repo.countItemsInKanbanColumn(
      workspacePublicId,
      projectPublicId,
      entryColumnPublicId,
    )
    const hasMoveAck = options?.kanbanWipMoveAck === true || options?.allowWipOverride === true
    const overrideReason = (options?.kanbanWipOverrideReason ?? "").trim() || null
    const g = checkKanbanWipMove(
      entryColumn,
      inEntry,
      hasMoveAck,
      overrideReason,
      canKanbanWipOverrideRole(actor),
    )
    if (g.outcome === "need_ack") {
      const p = g.payload
      throw new KanbanBoardWipMoveAckRequiredError(
        "Release would reach or exceed the entry column WIP limit (warning). Retry with kanban_wip_move_ack: true.",
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
        "Release is blocked by WIP. Retry with kanban_wip_override_reason and an authorized role, or wait for capacity.",
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

    const usedWipOverride =
      entryColumn.wipEnforcement === "blocking" &&
      entryColumn.wipLimit !== null &&
      inEntry + 1 > entryColumn.wipLimit &&
      overrideReason !== null

    if (this.workControls) {
      await this.workControls.assertMayReleaseKanbanToFlow({
        workspacePublicId,
        projectPublicId,
        item,
        entryColumnPublicId,
        actor,
        overrideToken: options?.workControlOverrideToken ?? null,
      })
    }

    const now = new Date()
    const next: ScrumBacklogItemState = {
      ...item,
      kanbanColumnPublicId: entryColumnPublicId,
      updatedAt: now,
    }
    await this.repo.replace(next)

    if (this.auditLogRepository) {
      await this.auditLogRepository.append({
        workspacePublicId,
        category: "kanban_backlog_item",
        action: "released_to_flow",
        actorUserPublicId: actor.userPublicId,
        occurredAt: now,
        resource: { projectPublicId, backlogItemPublicId },
        previousValue: {
          kanbanColumnPublicId: null,
          sortOrder: item.sortOrder,
        },
        nextValue: {
          kanbanColumnPublicId: entryColumnPublicId,
          entryColumnName: entryColumn.name,
          wipOverride: usedWipOverride,
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
          previousValue: { entryColumnPublicId, currentCount: inEntry, wipLimit: entryColumn.wipLimit },
          nextValue: {
            toColumnPublicId: entryColumnPublicId,
            reason: overrideReason,
            policy: entryColumn.wipEnforcement,
            projectedCountAfterMove: inEntry + 1,
          },
        })
      }
    }

    const persisted = await this.repo.findByProjectAndItemId(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
    )
    if (!persisted) throw new KanbanBacklogNotFoundError()
    return persisted
  }

  async returnItemToBacklog(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
  ): Promise<ScrumBacklogItemState> {
    assertCanReturnKanbanBoardItemsToBacklog(actor)
    await this.projectRuntimeService.requireKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const flow = await this.kanbanFlowService.getFlowConfigOrThrow(workspacePublicId, projectPublicId)

    const item = await this.repo.findByProjectAndItemId(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
    )
    if (!item) throw new KanbanBacklogNotFoundError()
    if (item.kanbanColumnPublicId === null) {
      throw new KanbanBacklogValidationError("Item is already in the Kanban backlog.")
    }
    if (!this.kanbanFlowService.findColumnByPublicId(flow, item.kanbanColumnPublicId)) {
      throw new KanbanBacklogValidationError("Item column is not part of the current Kanban flow.")
    }

    const minSort = await this.repo.minSortOrderKanbanBacklog(workspacePublicId, projectPublicId)
    const newSortOrder = minSort === null ? 0 : minSort - 1
    const now = new Date()
    const prevColumn = item.kanbanColumnPublicId

    const next: ScrumBacklogItemState = {
      ...item,
      kanbanColumnPublicId: null,
      parentItemPublicId: null,
      sortOrder: newSortOrder,
      updatedAt: now,
      isBlocked: false,
      blockedReason: null,
    }
    await this.repo.replace(next)

    if (this.auditLogRepository) {
      await this.auditLogRepository.append({
        workspacePublicId,
        category: "kanban_backlog_item",
        action: "returned_to_backlog",
        actorUserPublicId: actor.userPublicId,
        occurredAt: now,
        resource: { projectPublicId, backlogItemPublicId },
        previousValue: {
          kanbanColumnPublicId: prevColumn,
        },
        nextValue: {
          kanbanColumnPublicId: null,
          sortOrder: newSortOrder,
        },
      })
    }

    const persisted = await this.repo.findByProjectAndItemId(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
    )
    if (!persisted) throw new KanbanBacklogNotFoundError()
    return persisted
  }
}
