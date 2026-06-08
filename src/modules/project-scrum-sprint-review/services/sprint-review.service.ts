import { randomUUID } from "node:crypto"
import type { SprintReviewState } from "../../project-scrum-sprint-planning/domain/sprint-review.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import {
  SprintReviewConflictError,
  SprintReviewNotFoundError,
  SprintReviewValidationError,
} from "../domain/sprint-review.errors.js"
import type { CreateSprintReviewBody, PatchSprintReviewBody } from "../validation/sprint-review-http.schemas.js"

export function sprintReviewStateToJson(r: SprintReviewState) {
  return {
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
  }
}

export class SprintReviewService {
  constructor(
    private readonly sprintRepo: ScrumSprintPlanningRepository,
    private readonly projectRuntimeService: ProjectRuntimeService,
  ) {}

  private async requireClosedSprint(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
  ) {
    await this.projectRuntimeService.requireScrumWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const sprint = await this.sprintRepo.findSprintByPublicId(
      workspacePublicId,
      projectPublicId,
      sprintPublicId,
    )
    if (!sprint) {
      throw new SprintReviewNotFoundError()
    }
    if (sprint.status !== "closed") {
      throw new SprintReviewValidationError(
        "Sprint review is only available for closed sprints.",
      )
    }
    return sprint
  }

  /**
   * GET: `review` es `null` si aún no se registró (200, no 404).
   */
  async getReviewEnvelope(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
  ): Promise<{ review: SprintReviewState | null }> {
    const sprint = await this.requireClosedSprint(workspacePublicId, projectPublicId, sprintPublicId)
    return { review: sprint.review }
  }

  async createReview(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
    actorUserPublicId: string,
    body: CreateSprintReviewBody,
  ): Promise<SprintReviewState> {
    const sprint = await this.requireClosedSprint(workspacePublicId, projectPublicId, sprintPublicId)
    if (sprint.review) {
      throw new SprintReviewConflictError()
    }

    const summary = (body.summary ?? "").trim()
    const incrementReviewNotes = (body.incrementReviewNotes ?? "").trim()
    const decisions = (body.decisions ?? "").trim()
    const nextSteps = (body.nextSteps ?? "").trim()

    const now = new Date()
    const review: SprintReviewState = {
      reviewPublicId: randomUUID(),
      sprintPublicId,
      projectPublicId,
      workspacePublicId,
      summary,
      incrementReviewNotes,
      decisions,
      nextSteps,
      createdByUserPublicId: actorUserPublicId,
      updatedByUserPublicId: actorUserPublicId,
      createdAt: now,
      updatedAt: now,
    }

    await this.sprintRepo.replaceSprint({
      ...sprint,
      review,
      updatedAt: now,
    })

    const saved = await this.sprintRepo.findSprintByPublicId(
      workspacePublicId,
      projectPublicId,
      sprintPublicId,
    )
    if (!saved?.review) {
      throw new Error("sprint_review_missing_after_create")
    }
    return saved.review
  }

  async patchReview(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
    actorUserPublicId: string,
    body: PatchSprintReviewBody,
  ): Promise<SprintReviewState> {
    const sprint = await this.requireClosedSprint(workspacePublicId, projectPublicId, sprintPublicId)
    const current = sprint.review
    if (!current) {
      throw new SprintReviewValidationError(
        "No sprint review exists yet. Use POST to create one.",
      )
    }

    const now = new Date()
    const next: SprintReviewState = {
      ...current,
      summary: body.summary !== undefined ? body.summary.trim() : current.summary,
      incrementReviewNotes:
        body.incrementReviewNotes !== undefined
          ? body.incrementReviewNotes.trim()
          : current.incrementReviewNotes,
      decisions: body.decisions !== undefined ? body.decisions.trim() : current.decisions,
      nextSteps: body.nextSteps !== undefined ? body.nextSteps.trim() : current.nextSteps,
      updatedByUserPublicId: actorUserPublicId,
      updatedAt: now,
    }

    await this.sprintRepo.replaceSprint({
      ...sprint,
      review: next,
      updatedAt: now,
    })

    const saved = await this.sprintRepo.findSprintByPublicId(
      workspacePublicId,
      projectPublicId,
      sprintPublicId,
    )
    if (!saved?.review) {
      throw new Error("sprint_review_missing_after_patch")
    }
    return saved.review
  }
}
