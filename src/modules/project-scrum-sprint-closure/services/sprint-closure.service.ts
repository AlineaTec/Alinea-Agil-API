import { acceptanceCriteriaSummary } from "../../project-scrum-backlog/domain/acceptance-criterion.js"
import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { SprintClosureSnapshotItem } from "../../project-scrum-sprint-planning/domain/sprint-closure.js"
import type { ScrumSprintState } from "../../project-scrum-sprint-planning/domain/scrum-sprint.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import type { SprintBoardColumn } from "../../project-scrum-sprint-board/domain/sprint-board-column.js"
import {
  SprintClosureNotFoundError,
  SprintClosureValidationError,
} from "../domain/sprint-closure.errors.js"
import { closeSprintBodySchema } from "../validation/sprint-closure-http.schemas.js"

export class SprintClosureService {
  constructor(
    private readonly sprintRepo: ScrumSprintPlanningRepository,
    private readonly backlogRepo: ScrumBacklogRepository,
    private readonly projectRuntimeService: ProjectRuntimeService,
  ) {}

  /**
   * Cierra el sprint. Si ya está `closed`, devuelve el estado actual sin validar el body (idempotencia HTTP).
   */
  async closeSprint(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
    actorUserPublicId: string,
    rawBody: unknown,
  ): Promise<ScrumSprintState> {
    await this.projectRuntimeService.requireScrumWorkspaceRuntimeProject(workspacePublicId, projectPublicId)

    const sprint = await this.sprintRepo.findSprintByPublicId(
      workspacePublicId,
      projectPublicId,
      sprintPublicId,
    )
    if (!sprint) {
      throw new SprintClosureNotFoundError()
    }

    if (sprint.status === "closed") {
      if (!sprint.closure) {
        throw new SprintClosureValidationError(
          "Sprint is marked closed but closure snapshot is missing (inconsistent data).",
        )
      }
      return sprint
    }

    if (sprint.status !== "active") {
      throw new SprintClosureValidationError("Only an active sprint can be closed.")
    }

    const parsed = closeSprintBodySchema.safeParse(rawBody ?? {})
    if (!parsed.success) {
      throw new SprintClosureValidationError("Invalid request body for close sprint.", parsed.error.flatten())
    }
    const input = parsed.data

    const closureNote = input.closureNote.trim()
    if (!closureNote) {
      throw new SprintClosureValidationError("closureNote cannot be empty.")
    }

    const memberships = await this.sprintRepo.listMembershipsBySprintOrdered(
      workspacePublicId,
      projectPublicId,
      sprintPublicId,
    )

    const snapshotItems: SprintClosureSnapshotItem[] = []

    for (const m of memberships) {
      const item = await this.backlogRepo.findByProjectAndItemId(
        workspacePublicId,
        projectPublicId,
        m.backlogItemPublicId,
      )
      if (!item) continue
      if (item.itemType !== "user_story" && item.itemType !== "task") {
        continue
      }

      const finalBoardColumn: SprintBoardColumn = m.boardColumn ?? "to_do"
      const outcome = finalBoardColumn === "done" ? "completed" : "not_completed"

      const ac = acceptanceCriteriaSummary(item.acceptanceCriteria ?? [])

      snapshotItems.push({
        backlogItemPublicId: item.backlogItemPublicId,
        itemType: item.itemType,
        title: item.title,
        finalBoardColumn,
        outcome,
        backlogStatusAtClosure: item.status,
        sprintSortOrder: m.sprintSortOrder,
        storyPointsAtClosure: item.storyPoints ?? null,
        acceptanceCriteriaTotalCount: ac.totalCriteriaCount,
        acceptanceCriteriaPendingCount: ac.pendingCriteriaCount,
        acceptanceCriteriaDoneCount: ac.doneCriteriaCount,
        acceptanceCriteriaReviewedCount: ac.reviewedCriteriaCount,
      })
    }

    const hasIncomplete = snapshotItems.some((row) => row.outcome === "not_completed")
    if (hasIncomplete && input.confirmIncompleteWork !== true) {
      throw new SprintClosureValidationError(
        "There is incomplete work in this sprint. Resend with confirmIncompleteWork: true to confirm.",
      )
    }

    const now = new Date()
    const closure = {
      closedAt: now,
      closedByUserPublicId: actorUserPublicId,
      closureNote,
      goalAchieved: input.goalAchieved,
      sprintGoalAtClosure: sprint.goal,
      items: snapshotItems,
    }

    const nextSprint: ScrumSprintState = {
      ...sprint,
      status: "closed",
      closure,
      updatedAt: now,
    }

    await this.sprintRepo.replaceSprint(nextSprint)

    for (const row of snapshotItems) {
      if (row.outcome !== "completed") continue
      const item = await this.backlogRepo.findByProjectAndItemId(
        workspacePublicId,
        projectPublicId,
        row.backlogItemPublicId,
      )
      if (!item) continue
      if (item.completedInSprintPublicId !== sprintPublicId) {
        await this.backlogRepo.replace({
          ...item,
          completedInSprintPublicId: sprintPublicId,
          updatedAt: new Date(),
        })
      }
    }

    for (const m of memberships) {
      await this.sprintRepo.deleteMembership(
        workspacePublicId,
        projectPublicId,
        sprintPublicId,
        m.backlogItemPublicId,
      )
    }

    const saved = await this.sprintRepo.findSprintByPublicId(
      workspacePublicId,
      projectPublicId,
      sprintPublicId,
    )
    if (!saved) {
      throw new Error("sprint_missing_after_close")
    }
    return saved
  }
}
