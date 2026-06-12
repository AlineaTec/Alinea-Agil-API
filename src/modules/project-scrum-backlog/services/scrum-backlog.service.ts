import { randomUUID } from "node:crypto"
import type { AcceptanceCriterionState } from "../domain/acceptance-criterion.js"
import type { ScrumBacklogItemPriorityLevel } from "../domain/backlog-item-priority-level.js"
import type { ScrumBacklogItemStatus } from "../domain/backlog-item-status.js"
import type { ScrumBacklogItemType } from "../domain/backlog-item-type.js"
import type { ScrumBacklogItemState } from "../domain/scrum-backlog-item.js"
import {
  assertAcceptanceCriteriaChangesAllowed,
  assertCanPatchAcceptanceCriteriaOnly,
} from "../domain/scrum-backlog-acceptance-criteria.policy.js"
import {
  mergeAcceptanceCriteriaFromPatch,
  type AcceptanceCriterionPatchInput,
} from "../domain/scrum-backlog-acceptance-criteria.validation.js"
import { assertValidParentChildTypes } from "../domain/scrum-backlog-hierarchy.policy.js"
import { ScrumBacklogNotFoundError, ScrumBacklogValidationError } from "../domain/scrum-backlog.errors.js"
import { assertStoryPointsValueForItemType } from "../domain/scrum-backlog-operational-fields.policy.js"
import {
  assertCanMutateScrumBacklog,
  assertCanReadScrumBacklog,
} from "../policies/scrum-backlog-authorization.policy.js"
import type { ScrumBacklogRepository } from "../persistence/scrum-backlog.repository.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { WorkspaceAuditLogRepository } from "../../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import type { WorkItemAssignmentListFilter } from "../../work-item-assignment/utils/work-item-assignment-list-filter.util.js"
import {
  applyWorkItemAssignmentListFilter,
  buildWorkItemAssignmentListWhere,
} from "../../work-item-assignment/utils/work-item-assignment-list-filter.util.js"
import type { WorkReadyDoneControlsService } from "../../work-ready-done-controls/services/work-ready-done-controls.service.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type { WorkActivityNotificationFanoutService } from "../../work-activity-notifications/services/work-activity-notification-fanout.service.js"

function acceptanceCriteriaDigest(criteria: readonly AcceptanceCriterionState[]): string {
  const sorted = [...criteria].sort((a, b) =>
    a.acceptanceCriterionPublicId.localeCompare(b.acceptanceCriterionPublicId),
  )
  return JSON.stringify(
    sorted.map((x) => ({
      id: x.acceptanceCriterionPublicId,
      t: x.text,
      s: x.status,
    })),
  )
}

export type CreateScrumBacklogItemInput = {
  itemType: ScrumBacklogItemType
  title: string
  description: string
  parentItemPublicId?: string | null
  status?: ScrumBacklogItemStatus
  sortOrder?: number
  storyPoints?: number | null
  priorityLevel?: ScrumBacklogItemPriorityLevel
  acceptanceCriteria?: AcceptanceCriterionPatchInput[]
}
export type PatchScrumBacklogItemInput = {
  title?: string
  description?: string
  status?: ScrumBacklogItemStatus
  sortOrder?: number
  parentItemPublicId?: string | null
  storyPoints?: number | null
  priorityLevel?: ScrumBacklogItemPriorityLevel
  acceptanceCriteria?: AcceptanceCriterionPatchInput[]
}

export type MoveBacklogItemDirection = "up" | "down"

export type MoveBacklogItemResult = {
  item: ScrumBacklogItemState
  moved: boolean
}

export class ScrumBacklogService {
  constructor(
    private readonly repo: ScrumBacklogRepository,
    private readonly projectRuntimeService: ProjectRuntimeService,
    private readonly sprintRepo: ScrumSprintPlanningRepository,
    private readonly auditLogRepository: WorkspaceAuditLogRepository | null = null,
    private readonly workControls: WorkReadyDoneControlsService | null = null,
    private readonly workActivityNotifications: WorkActivityNotificationFanoutService | null = null,
  ) {}

  async listBacklogItems(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    assignmentFilter?: WorkItemAssignmentListFilter,
  ): Promise<ScrumBacklogItemState[]> {
    assertCanReadScrumBacklog(actor)
    await this.projectRuntimeService.requireScrumWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const items = await this.repo.listByProject(workspacePublicId, projectPublicId)
    return applyWorkItemAssignmentListFilter(items, actor, assignmentFilter)
  }

  async listBacklogItemsPage(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    page: number,
    pageSize: number,
    assignmentFilter?: WorkItemAssignmentListFilter,
  ): Promise<{
    items: ScrumBacklogItemState[]
    page: number
    pageSize: number
    total: number
    hasNextPage: boolean
  }> {
    assertCanReadScrumBacklog(actor)
    await this.projectRuntimeService.requireScrumWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const assignmentWhere = buildWorkItemAssignmentListWhere(actor, assignmentFilter)
    const safePage = Math.max(1, page)
    const safePageSize = Math.min(100, Math.max(1, pageSize))
    const skip = (safePage - 1) * safePageSize
    const [total, items] = await Promise.all([
      this.repo.countByProject(workspacePublicId, projectPublicId, assignmentWhere),
      this.repo.listByProjectPage(workspacePublicId, projectPublicId, {
        skip,
        take: safePageSize,
        assignmentWhere,
      }),
    ])
    return {
      items,
      page: safePage,
      pageSize: safePageSize,
      total,
      hasNextPage: skip + items.length < total,
    }
  }

  async getBacklogItem(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
  ): Promise<ScrumBacklogItemState> {
    assertCanReadScrumBacklog(actor)
    await this.projectRuntimeService.requireScrumWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const row = await this.repo.findByProjectAndItemId(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
    )
    if (!row) throw new ScrumBacklogNotFoundError()
    return row
  }

  async createBacklogItem(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    input: CreateScrumBacklogItemInput,
  ): Promise<ScrumBacklogItemState> {
    assertCanMutateScrumBacklog(actor)
    await this.projectRuntimeService.requireScrumWorkspaceRuntimeProject(workspacePublicId, projectPublicId)

    const parentId =
      input.parentItemPublicId === undefined || input.parentItemPublicId === null
        ? null
        : input.parentItemPublicId

    if (input.itemType === "task" || input.itemType === "subtask") {
      if (parentId === null) {
        throw new ScrumBacklogValidationError(`${input.itemType} requires a parent item.`)
      }
    }

    if (input.itemType === "epic" && parentId !== null) {
      throw new ScrumBacklogValidationError("An epic cannot have a parent.")
    }

    const parentType = await this.resolveParentType(workspacePublicId, projectPublicId, parentId)
    assertValidParentChildTypes(input.itemType, parentType)

    const sortOrder =
      input.sortOrder ??
      (await this.repo.maxSortOrderAmongSiblings(workspacePublicId, projectPublicId, parentId)) + 1

    const storyPoints = input.storyPoints !== undefined ? input.storyPoints : null
    assertStoryPointsValueForItemType(input.itemType, storyPoints)
    const priorityLevel: ScrumBacklogItemPriorityLevel = input.priorityLevel ?? "none"

    const now = new Date()
    const acceptanceCriteria =
      input.acceptanceCriteria !== undefined && input.acceptanceCriteria.length > 0
        ? mergeAcceptanceCriteriaFromPatch(input.itemType, [], input.acceptanceCriteria, now)
        : []

    const state: ScrumBacklogItemState = {
      backlogItemPublicId: randomUUID(),
      workspacePublicId,
      projectPublicId,
      itemType: input.itemType,
      title: input.title.trim().slice(0, 500),
      description: input.description.trim().slice(0, 8000),
      status: input.status ?? "open",
      sortOrder,
      parentItemPublicId: parentId,
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
      throw new ScrumBacklogValidationError("Title cannot be empty.")
    }

    await this.repo.insert(state)
    const persisted = await this.repo.findByProjectAndItemId(
      workspacePublicId,
      projectPublicId,
      state.backlogItemPublicId,
    )
    if (!persisted) {
      throw new Error("scrum_backlog_insert_missing_after_create")
    }
    return persisted
  }

  async updateBacklogItem(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
    patch: PatchScrumBacklogItemInput,
    options?: { workControlOverrideToken?: string | null },
  ): Promise<ScrumBacklogItemState> {
    await this.projectRuntimeService.requireScrumWorkspaceRuntimeProject(workspacePublicId, projectPublicId)

    const keys = Object.keys(patch) as (keyof PatchScrumBacklogItemInput)[]
    if (keys.length === 0) {
      throw new ScrumBacklogValidationError("No fields to update.")
    }

    const onlyAcceptanceCriteria = keys.length === 1 && keys[0] === "acceptanceCriteria"
    if (onlyAcceptanceCriteria) {
      assertCanPatchAcceptanceCriteriaOnly(actor)
    } else {
      assertCanMutateScrumBacklog(actor)
    }

    const current = await this.repo.findByProjectAndItemId(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
    )
    if (!current) throw new ScrumBacklogNotFoundError()

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
        const inActive = await this.isBacklogItemInActiveSprint(
          workspacePublicId,
          projectPublicId,
          backlogItemPublicId,
        )
        assertAcceptanceCriteriaChangesAllowed(actor, current.acceptanceCriteria, merged, inActive)
      }
      nextAcceptanceCriteria = merged
    }

    let nextParentId = current.parentItemPublicId
    if (patch.parentItemPublicId !== undefined) {
      nextParentId = patch.parentItemPublicId
    }

    if (current.itemType === "epic" && nextParentId !== null) {
      throw new ScrumBacklogValidationError("An epic cannot have a parent.")
    }

    if (
      (current.itemType === "task" || current.itemType === "subtask") &&
      patch.parentItemPublicId !== undefined &&
      nextParentId === null
    ) {
      throw new ScrumBacklogValidationError(`${current.itemType} must keep a parent.`)
    }

    const parentType = await this.resolveParentType(workspacePublicId, projectPublicId, nextParentId)
    assertValidParentChildTypes(current.itemType, parentType)

    if (patch.parentItemPublicId !== undefined && nextParentId !== null) {
      await this.assertNewParentIsNotDescendant(
        workspacePublicId,
        projectPublicId,
        backlogItemPublicId,
        nextParentId,
      )
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
      title:
        patch.title !== undefined ? patch.title.trim().slice(0, 500) : current.title,
      description:
        patch.description !== undefined
          ? patch.description.trim().slice(0, 8000)
          : current.description,
      status: patch.status !== undefined ? patch.status : current.status,
      sortOrder: patch.sortOrder !== undefined ? patch.sortOrder : current.sortOrder,
      parentItemPublicId: nextParentId,
      storyPoints: nextStoryPoints,
      priorityLevel: nextPriorityLevel,
      acceptanceCriteria: nextAcceptanceCriteria,
      updatedAt: now,
    }

    if (!next.title) {
      throw new ScrumBacklogValidationError("Title cannot be empty.")
    }

    if (this.workControls) {
      const token = options?.workControlOverrideToken ?? null
      if (patch.status === "in_progress" && current.status !== "in_progress") {
        await this.workControls.assertMayTransitionScrumToInProgress({
          workspacePublicId,
          projectPublicId,
          current,
          actor,
          overrideToken: token,
        })
      }
      if (patch.status === "done" && current.status !== "done") {
        await this.workControls.assertMayCloseScrumItemToDone({
          workspacePublicId,
          projectPublicId,
          current,
          actor,
          overrideToken: token,
        })
      }
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

    if (this.auditLogRepository) {
      if (patch.storyPoints !== undefined && (current.storyPoints ?? null) !== (next.storyPoints ?? null)) {
        await this.auditLogRepository.append({
          workspacePublicId,
          category: "scrum_backlog_item",
          action: "story_points_updated",
          actorUserPublicId: actor.userPublicId,
          occurredAt: now,
          resource: { projectPublicId, backlogItemPublicId },
          previousValue: current.storyPoints ?? null,
          nextValue: next.storyPoints ?? null,
        })
      }
      if (patch.priorityLevel !== undefined && current.priorityLevel !== next.priorityLevel) {
        await this.auditLogRepository.append({
          workspacePublicId,
          category: "scrum_backlog_item",
          action: "priority_level_updated",
          actorUserPublicId: actor.userPublicId,
          occurredAt: now,
          resource: { projectPublicId, backlogItemPublicId },
          previousValue: current.priorityLevel,
          nextValue: next.priorityLevel,
        })
      }
      if (patch.acceptanceCriteria !== undefined) {
        const prevDigest = acceptanceCriteriaDigest(current.acceptanceCriteria)
        const nextDigest = acceptanceCriteriaDigest(next.acceptanceCriteria)
        if (prevDigest !== nextDigest) {
          await this.auditLogRepository.append({
            workspacePublicId,
            category: "scrum_backlog_item",
            action: "acceptance_criteria_updated",
            actorUserPublicId: actor.userPublicId,
            occurredAt: now,
            resource: { projectPublicId, backlogItemPublicId },
            previousValue: prevDigest,
            nextValue: nextDigest,
          })
        }
      }
    }
    const persisted = await this.repo.findByProjectAndItemId(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
    )
    if (!persisted) throw new ScrumBacklogNotFoundError()
    return persisted
  }

  /**
   * Reordena el ítem un paso entre **hermanos** (mismo `parentItemPublicId`).
   * Renumeración `0..n-1` dentro del grupo para mantener orden estable con empates en `sortOrder`.
   * En el primer/último puesto, `moved === false` (idempotente,200 sin cambios persistidos).
   */
  async moveBacklogItemRelative(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
    direction: MoveBacklogItemDirection,
  ): Promise<MoveBacklogItemResult> {
    assertCanMutateScrumBacklog(actor)
    await this.projectRuntimeService.requireScrumWorkspaceRuntimeProject(workspacePublicId, projectPublicId)

    const current = await this.repo.findByProjectAndItemId(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
    )
    if (!current) throw new ScrumBacklogNotFoundError()

    const all = await this.repo.listByProject(workspacePublicId, projectPublicId)
    const parentKey = current.parentItemPublicId
    const siblings = all
      .filter((r) => r.parentItemPublicId === parentKey)
      .sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
        return a.createdAt.getTime() - b.createdAt.getTime()
      })

    const idx = siblings.findIndex((s) => s.backlogItemPublicId === backlogItemPublicId)
    if (idx === -1) throw new ScrumBacklogNotFoundError()

    if (direction === "up") {
      if (idx === 0) {
        return { item: current, moved: false }
      }
    } else {
      if (idx === siblings.length - 1) {
        return { item: current, moved: false }
      }
    }

    const reordered = [...siblings]
    if (direction === "up") {
      ;[reordered[idx - 1], reordered[idx]] = [reordered[idx], reordered[idx - 1]]
    } else {
      ;[reordered[idx], reordered[idx + 1]] = [reordered[idx + 1], reordered[idx]]
    }

    const now = new Date()
    const updates = reordered.map((s, i) => ({
      backlogItemPublicId: s.backlogItemPublicId,
      sortOrder: i,
      updatedAt: now,
    }))

    await this.repo.bulkSetSortOrders(workspacePublicId, projectPublicId, updates)

    const refreshed = await this.repo.findByProjectAndItemId(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
    )
    if (!refreshed) throw new ScrumBacklogNotFoundError()
    return { item: refreshed, moved: true }
  }

  private async isBacklogItemInActiveSprint(
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
  ): Promise<boolean> {
    const rows = await this.sprintRepo.listMembershipRowsForBacklogItemInProject(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
    )
    for (const row of rows) {
      const sprint = await this.sprintRepo.findSprintByPublicId(
        workspacePublicId,
        projectPublicId,
        row.sprintPublicId,
      )
      if (sprint?.status === "active") {
        return true
      }
    }
    return false
  }

  private async resolveParentType(
    workspacePublicId: string,
    projectPublicId: string,
    parentItemPublicId: string | null,
  ): Promise<ScrumBacklogItemType | null> {
    if (parentItemPublicId === null) return null
    const parent = await this.repo.findByProjectAndItemId(
      workspacePublicId,
      projectPublicId,
      parentItemPublicId,
    )
    if (!parent) {
      throw new ScrumBacklogValidationError("Parent backlog item not found in this project.")
    }
    return parent.itemType
  }

  private async assertNewParentIsNotDescendant(
    workspacePublicId: string,
    projectPublicId: string,
    itemPublicId: string,
    newParentId: string,
  ): Promise<void> {
    let cur: string | null = newParentId
    const seen = new Set<string>()
    while (cur) {
      if (cur === itemPublicId) {
        throw new ScrumBacklogValidationError("Cannot set parent: would create a cycle in the hierarchy.")
      }
      if (seen.has(cur)) {
        throw new ScrumBacklogValidationError("Invalid parent chain detected.")
      }
      seen.add(cur)
      const node = await this.repo.findByProjectAndItemId(workspacePublicId, projectPublicId, cur)
      if (!node) {
        throw new ScrumBacklogValidationError("Parent chain broken.")
      }
      cur = node.parentItemPublicId
    }
  }
}
