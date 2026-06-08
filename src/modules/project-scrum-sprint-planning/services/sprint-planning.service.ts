import { randomUUID } from "node:crypto"
import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import type { ProjectScrumSprintAssignmentState } from "../domain/project-scrum-sprint-assignment.js"
import type { ScrumSprintState } from "../domain/scrum-sprint.js"
import {
  SprintPlanningNotFoundError,
  SprintPlanningValidationError,
} from "../domain/sprint-planning.errors.js"
import { SPRINT_STATUSES_BLOCKING_OTHER_COMMITMENT } from "../domain/sprint-status.js"
import type { ScrumSprintPlanningRepository } from "../persistence/scrum-sprint-planning.repository.js"
import { formatDateOnly, parseDateOnlyToUtcNoon } from "../validation/sprint-planning-http.schemas.js"
import type { WorkReadyDoneControlsService } from "../../work-ready-done-controls/services/work-ready-done-controls.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type { WorkActivityNotificationFanoutService } from "../../work-activity-notifications/services/work-activity-notification-fanout.service.js"

export type CreateSprintInput = {
  name: string
  goal?: string
  startDate?: string
  endDate?: string
}

export type PatchSprintInput = {
  name?: string
  goal?: string
  startDate?: string | null
  endDate?: string | null
}

export type CommittedItemRow = {
  membership: ProjectScrumSprintAssignmentState
  backlogItem: {
    backlogItemPublicId: string
    itemType: string
    title: string
    status: string
    storyPoints: number | null
    priorityLevel: string
  }
}

export class SprintPlanningService {
  constructor(
    private readonly sprintRepo: ScrumSprintPlanningRepository,
    private readonly backlogRepo: ScrumBacklogRepository,
    private readonly projectRuntimeService: ProjectRuntimeService,
    private readonly workControls: WorkReadyDoneControlsService | null = null,
    private readonly workActivityNotifications: WorkActivityNotificationFanoutService | null = null,
  ) {}

  async listSprints(workspacePublicId: string, projectPublicId: string): Promise<ScrumSprintState[]> {
    await this.projectRuntimeService.requireScrumWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    return this.sprintRepo.listSprintsByProject(workspacePublicId, projectPublicId)
  }

  async createSprint(
    workspacePublicId: string,
    projectPublicId: string,
    actorUserPublicId: string,
    input: CreateSprintInput,
  ): Promise<ScrumSprintState> {
    await this.projectRuntimeService.requireScrumWorkspaceRuntimeProject(workspacePublicId, projectPublicId)

    const planningCount = await this.sprintRepo.countSprintsByProjectAndStatus(
      workspacePublicId,
      projectPublicId,
      "planning",
    )
    if (planningCount >= 1) {
      throw new SprintPlanningValidationError(
        "Only one sprint in planning is allowed per project in this MVP.",
      )
    }

    const now = new Date()
    const sprintPublicId = randomUUID()
    const startDate = input.startDate ? parseDateOnlyToUtcNoon(input.startDate) : null
    const endDate = input.endDate ? parseDateOnlyToUtcNoon(input.endDate) : null

    if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
      throw new SprintPlanningValidationError("endDate must be on or after startDate.")
    }

    const state: ScrumSprintState = {
      sprintPublicId,
      workspacePublicId,
      projectPublicId,
      name: input.name.trim(),
      goal: (input.goal ?? "").trim(),
      status: "planning",
      startDate,
      endDate,
      createdByUserPublicId: actorUserPublicId,
      createdAt: now,
      updatedAt: now,
      closure: null,
      review: null,
      retrospective: null,
    }

    await this.sprintRepo.insertSprint(state)
    const created = await this.sprintRepo.findSprintByPublicId(
      workspacePublicId,
      projectPublicId,
      sprintPublicId,
    )
    if (!created) {
      throw new Error("sprint_insert_missing_after_create")
    }
    return created
  }

  async getSprint(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
  ): Promise<ScrumSprintState> {
    await this.projectRuntimeService.requireScrumWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const s = await this.sprintRepo.findSprintByPublicId(workspacePublicId, projectPublicId, sprintPublicId)
    if (!s) {
      throw new SprintPlanningNotFoundError()
    }
    return s
  }

  async updateSprint(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
    input: PatchSprintInput,
  ): Promise<ScrumSprintState> {
    await this.projectRuntimeService.requireScrumWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const current = await this.requireSprint(workspacePublicId, projectPublicId, sprintPublicId)

    if (current.status !== "planning") {
      throw new SprintPlanningValidationError(
        "Sprint can only be edited while in planning. Revert to planning first.",
      )
    }

    const next: ScrumSprintState = {
      ...current,
      name: input.name !== undefined ? input.name.trim() : current.name,
      goal: input.goal !== undefined ? input.goal.trim() : current.goal,
      startDate:
        input.startDate === undefined
          ? current.startDate
          : input.startDate === null
            ? null
            : parseDateOnlyToUtcNoon(input.startDate),
      endDate:
        input.endDate === undefined
          ? current.endDate
          : input.endDate === null
            ? null
            : parseDateOnlyToUtcNoon(input.endDate),
      updatedAt: new Date(),
    }

    if (next.startDate && next.endDate && next.endDate.getTime() < next.startDate.getTime()) {
      throw new SprintPlanningValidationError("endDate must be on or after startDate.")
    }

    await this.sprintRepo.replaceSprint(next)
    return this.requireSprint(workspacePublicId, projectPublicId, sprintPublicId)
  }

  async markSprintReadyForExecution(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
  ): Promise<ScrumSprintState> {
    await this.projectRuntimeService.requireScrumWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const current = await this.requireSprint(workspacePublicId, projectPublicId, sprintPublicId)

    if (current.status !== "planning") {
      throw new SprintPlanningValidationError("Only a sprint in planning can be marked ready for execution.")
    }

    if (!current.goal.trim()) {
      throw new SprintPlanningValidationError("Goal is required before marking ready for execution.")
    }
    if (!current.startDate || !current.endDate) {
      throw new SprintPlanningValidationError(
        "startDate and endDate are required before marking ready for execution.",
      )
    }
    if (current.endDate.getTime() < current.startDate.getTime()) {
      throw new SprintPlanningValidationError("endDate must be on or after startDate.")
    }

    const otherReady = await this.sprintRepo.countSprintsByProjectAndStatusExcludingSprint(
      workspacePublicId,
      projectPublicId,
      "ready_for_execution",
      sprintPublicId,
    )
    if (otherReady >= 1) {
      throw new SprintPlanningValidationError(
        "Only one sprint in ready_for_execution is allowed per project in this MVP.",
      )
    }

    const next: ScrumSprintState = {
      ...current,
      status: "ready_for_execution",
      updatedAt: new Date(),
    }
    await this.sprintRepo.replaceSprint(next)
    return this.requireSprint(workspacePublicId, projectPublicId, sprintPublicId)
  }

  async revertSprintToPlanning(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
  ): Promise<ScrumSprintState> {
    await this.projectRuntimeService.requireScrumWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const current = await this.requireSprint(workspacePublicId, projectPublicId, sprintPublicId)

    if (current.status !== "ready_for_execution") {
      throw new SprintPlanningValidationError("Only a sprint ready for execution can revert to planning.")
    }

    const next: ScrumSprintState = {
      ...current,
      status: "planning",
      updatedAt: new Date(),
    }
    await this.sprintRepo.replaceSprint(next)
    return this.requireSprint(workspacePublicId, projectPublicId, sprintPublicId)
  }

  async listCommittedItems(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
  ): Promise<CommittedItemRow[]> {
    await this.projectRuntimeService.requireScrumWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    await this.requireSprint(workspacePublicId, projectPublicId, sprintPublicId)

    const memberships = await this.sprintRepo.listMembershipsBySprintOrdered(
      workspacePublicId,
      projectPublicId,
      sprintPublicId,
    )

    const rows: CommittedItemRow[] = []
    for (const m of memberships) {
      const item = await this.backlogRepo.findByProjectAndItemId(
        workspacePublicId,
        projectPublicId,
        m.backlogItemPublicId,
      )
      if (!item) {
        continue
      }
      rows.push({
        membership: m,
        backlogItem: {
          backlogItemPublicId: item.backlogItemPublicId,
          itemType: item.itemType,
          title: item.title,
          status: item.status,
          storyPoints: item.storyPoints,
          priorityLevel: item.priorityLevel,
        },
      })
    }
    return rows
  }

  async commitBacklogItemToSprint(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
    backlogItemPublicId: string,
    actor: WorkspaceMemberState,
    options?: { workControlOverrideToken?: string | null },
  ): Promise<ProjectScrumSprintAssignmentState> {
    await this.projectRuntimeService.requireScrumWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const sprint = await this.requireSprint(workspacePublicId, projectPublicId, sprintPublicId)

    if (sprint.status !== "planning") {
      throw new SprintPlanningValidationError(
        "Items can only be committed or removed while the sprint is in planning.",
      )
    }

    const item = await this.backlogRepo.findByProjectAndItemId(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
    )
    if (!item) {
      throw new SprintPlanningNotFoundError("Backlog item not found in this project.")
    }

    if (item.itemType !== "user_story" && item.itemType !== "task") {
      throw new SprintPlanningValidationError(
        "Only user_story and task items can be committed to a sprint in this MVP.",
      )
    }

    const existingHere = await this.sprintRepo.findMembership(
      workspacePublicId,
      projectPublicId,
      sprintPublicId,
      backlogItemPublicId,
    )
    if (existingHere) {
      return existingHere
    }

    await this.assertNoBlockingMembershipElsewhere(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
      sprintPublicId,
    )

    if (this.workControls) {
      const token = options?.workControlOverrideToken ?? null
      await this.workControls.assertMayCommitToSprint({
        workspacePublicId,
        projectPublicId,
        workItemPublicId: backlogItemPublicId,
        actor,
        overrideToken: token,
      })
    }

    const maxOrder = await this.sprintRepo.maxSprintSortOrder(
      workspacePublicId,
      projectPublicId,
      sprintPublicId,
    )
    const membership: ProjectScrumSprintAssignmentState = {
      sprintPublicId,
      backlogItemPublicId,
      workspacePublicId,
      projectPublicId,
      sprintSortOrder: maxOrder + 1,
      committedAt: new Date(),
      committedByUserPublicId: actor.userPublicId,
      boardColumn: null,
    }

    try {
      await this.sprintRepo.insertMembership(membership)
    } catch (e) {
      if (isMongoDuplicateKeyError(e)) {
        throw new SprintPlanningValidationError("This backlog item is already committed to this sprint.")
      }
      throw e
    }

    const saved = await this.sprintRepo.findMembership(
      workspacePublicId,
      projectPublicId,
      sprintPublicId,
      backlogItemPublicId,
    )
    if (!saved) {
      throw new Error("sprint_membership_missing_after_insert")
    }

    if (this.workActivityNotifications) {
      const operationDedupeId = randomUUID()
      void this.workActivityNotifications
        .onSprintCommitmentChanged({
          workspacePublicId,
          projectPublicId,
          sprintPublicId,
          workItemPublicId: backlogItemPublicId,
          itemTitle: item.title,
          assigneeUserPublicId: item.assignedUserPublicId,
          actorUserPublicId: actor.userPublicId,
          added: true,
          operationDedupeId,
          at: saved.committedAt,
        })
        .catch((e) => {
          console.error("[work-activity-notifications] fanout failed", e)
        })
    }

    return saved
  }

  async removeBacklogItemFromSprint(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
    backlogItemPublicId: string,
    actor: WorkspaceMemberState,
  ): Promise<void> {
    await this.projectRuntimeService.requireScrumWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const sprint = await this.requireSprint(workspacePublicId, projectPublicId, sprintPublicId)

    if (sprint.status !== "planning") {
      throw new SprintPlanningValidationError(
        "Items can only be committed or removed while the sprint is in planning.",
      )
    }

    const existing = await this.sprintRepo.findMembership(
      workspacePublicId,
      projectPublicId,
      sprintPublicId,
      backlogItemPublicId,
    )
    if (!existing) {
      throw new SprintPlanningNotFoundError("Membership not found for this backlog item in the sprint.")
    }

    const item = await this.backlogRepo.findByProjectAndItemId(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
    )

    await this.sprintRepo.deleteMembership(
      workspacePublicId,
      projectPublicId,
      sprintPublicId,
      backlogItemPublicId,
    )

    if (this.workActivityNotifications && item) {
      const operationDedupeId = randomUUID()
      void this.workActivityNotifications
        .onSprintCommitmentChanged({
          workspacePublicId,
          projectPublicId,
          sprintPublicId,
          workItemPublicId: backlogItemPublicId,
          itemTitle: item.title,
          assigneeUserPublicId: item.assignedUserPublicId,
          actorUserPublicId: actor.userPublicId,
          added: false,
          operationDedupeId,
          at: new Date(),
        })
        .catch((e) => {
          console.error("[work-activity-notifications] fanout failed", e)
        })
    }
  }

  private async requireSprint(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
  ): Promise<ScrumSprintState> {
    const s = await this.sprintRepo.findSprintByPublicId(workspacePublicId, projectPublicId, sprintPublicId)
    if (!s) {
      throw new SprintPlanningNotFoundError()
    }
    return s
  }

  private async assertNoBlockingMembershipElsewhere(
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
    currentSprintPublicId: string,
  ): Promise<void> {
    const rows = await this.sprintRepo.listMembershipRowsForBacklogItemInProject(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
    )
    for (const row of rows) {
      if (row.sprintPublicId === currentSprintPublicId) continue
      const other = await this.sprintRepo.findSprintByPublicId(
        workspacePublicId,
        projectPublicId,
        row.sprintPublicId,
      )
      if (other && SPRINT_STATUSES_BLOCKING_OTHER_COMMITMENT.has(other.status)) {
        throw new SprintPlanningValidationError(
          "This backlog item is already committed to another open sprint for this project.",
        )
      }
    }
  }
}

/** Unicidad violada (Prisma P2002 o código 11000 legacy). */
function isMongoDuplicateKeyError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false
  const code = (e as { code?: number }).code
  return code === 11_000 || code === 11_001
}

/** Para serialización HTTP (fechas solo-día). */
export function sprintStateToJson(s: ScrumSprintState) {
  const base = {
    sprintPublicId: s.sprintPublicId,
    workspacePublicId: s.workspacePublicId,
    projectPublicId: s.projectPublicId,
    name: s.name,
    goal: s.goal,
    status: s.status,
    startDate: s.startDate ? formatDateOnly(s.startDate) : null,
    endDate: s.endDate ? formatDateOnly(s.endDate) : null,
    createdByUserPublicId: s.createdByUserPublicId,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }
  if (s.status === "closed" && s.closure) {
    const c = s.closure
    const closedJson = {
      ...base,
      closedAt: c.closedAt.toISOString(),
      closedByUserPublicId: c.closedByUserPublicId,
      closureNote: c.closureNote,
      goalAchieved: c.goalAchieved,
      sprintGoalAtClosure: c.sprintGoalAtClosure,
      closure: {
        closedAt: c.closedAt.toISOString(),
        closedByUserPublicId: c.closedByUserPublicId,
        closureNote: c.closureNote,
        goalAchieved: c.goalAchieved,
        sprintGoalAtClosure: c.sprintGoalAtClosure,
        items: c.items.map((row) => {
          const base = {
            backlogItemPublicId: row.backlogItemPublicId,
            itemType: row.itemType,
            title: row.title,
            finalBoardColumn: row.finalBoardColumn,
            outcome: row.outcome,
            backlogStatusAtClosure: row.backlogStatusAtClosure,
            sprintSortOrder: row.sprintSortOrder,
          }
          return {
            ...base,
            ...(row.storyPointsAtClosure !== undefined ? { storyPointsAtClosure: row.storyPointsAtClosure } : {}),
            ...(row.acceptanceCriteriaTotalCount !== undefined
              ? {
                  acceptanceCriteriaTotalCount: row.acceptanceCriteriaTotalCount,
                  acceptanceCriteriaPendingCount: row.acceptanceCriteriaPendingCount,
                  acceptanceCriteriaDoneCount: row.acceptanceCriteriaDoneCount,
                  acceptanceCriteriaReviewedCount: row.acceptanceCriteriaReviewedCount,
                }
              : {}),
          }
        }),
      },
    }
    let out: Record<string, unknown> = closedJson
    if (s.review) {
      const r = s.review
      out = {
        ...out,
        review: {
          reviewPublicId: r.reviewPublicId,
          sprintPublicId: r.sprintPublicId,
          projectPublicId: r.projectPublicId,
          workspacePublicId: r.workspacePublicId,
          summary: r.summary,
          incrementReviewNotes: r.incrementReviewNotes,
          decisions: r.decisions,
          nextSteps: r.nextSteps,
          createdByUserPublicId: r.createdByUserPublicId,
          updatedByUserPublicId: r.updatedByUserPublicId,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        },
      }
    }
    if (s.retrospective) {
      const t = s.retrospective
      out = {
        ...out,
        retrospective: {
          retrospectivePublicId: t.retrospectivePublicId,
          sprintPublicId: t.sprintPublicId,
          projectPublicId: t.projectPublicId,
          workspacePublicId: t.workspacePublicId,
          wentWell: t.wentWell,
          didNotGoWell: t.didNotGoWell,
          improvements: t.improvements,
          actionItems: t.actionItems.map((a) => ({
            actionItemPublicId: a.actionItemPublicId,
            text: a.text,
            ownerUserPublicId: a.ownerUserPublicId,
            status: a.status,
            createdAt: a.createdAt.toISOString(),
            updatedAt: a.updatedAt.toISOString(),
          })),
          createdByUserPublicId: t.createdByUserPublicId,
          updatedByUserPublicId: t.updatedByUserPublicId,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
        },
      }
    }
    return out
  }
  return base
}
