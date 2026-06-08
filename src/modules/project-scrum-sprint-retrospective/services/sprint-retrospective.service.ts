import { randomUUID } from "node:crypto"
import type {
  SprintRetrospectiveActionItemState,
  SprintRetrospectiveState,
} from "../../project-scrum-sprint-planning/domain/sprint-retrospective.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import {
  SprintRetrospectiveConflictError,
  SprintRetrospectiveNotFoundError,
  SprintRetrospectiveValidationError,
} from "../domain/sprint-retrospective.errors.js"
import type {
  CreateSprintRetrospectiveBody,
  PatchSprintRetrospectiveBody,
} from "../validation/sprint-retrospective-http.schemas.js"

function retrospectiveActionItemToJson(a: SprintRetrospectiveActionItemState) {
  return {
    actionItemPublicId: a.actionItemPublicId,
    text: a.text,
    ownerUserPublicId: a.ownerUserPublicId,
    status: a.status,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }
}

export function sprintRetrospectiveStateToJson(r: SprintRetrospectiveState) {
  return {
    retrospectivePublicId: r.retrospectivePublicId,
    sprintPublicId: r.sprintPublicId,
    projectPublicId: r.projectPublicId,
    workspacePublicId: r.workspacePublicId,
    wentWell: r.wentWell,
    didNotGoWell: r.didNotGoWell,
    improvements: r.improvements,
    actionItems: r.actionItems.map(retrospectiveActionItemToJson),
    createdByUserPublicId: r.createdByUserPublicId,
    updatedByUserPublicId: r.updatedByUserPublicId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }
}

type PatchActionRow = NonNullable<PatchSprintRetrospectiveBody["actionItems"]>[number]

/**
 * Sustituye la lista de action items según el cuerpo del PATCH.
 * Si viene `actionItemPublicId` y coincide con un ítem actual, se conserva `createdAt`.
 * Si no, se genera un ítem nuevo (reemplazo completo de lista con preservación barata).
 */
function mergeActionItemsForPatch(
  current: SprintRetrospectiveActionItemState[],
  bodyItems: PatchActionRow[],
  now: Date,
): SprintRetrospectiveActionItemState[] {
  const byId = new Map(current.map((a) => [a.actionItemPublicId, a]))
  return bodyItems.map((item) => {
    const prev = item.actionItemPublicId ? byId.get(item.actionItemPublicId) : undefined
    if (prev) {
      return {
        actionItemPublicId: prev.actionItemPublicId,
        text: item.text.trim(),
        ownerUserPublicId: item.ownerUserPublicId ?? null,
        status: item.status,
        createdAt: prev.createdAt,
        updatedAt: now,
      }
    }
    return {
      actionItemPublicId: randomUUID(),
      text: item.text.trim(),
      ownerUserPublicId: item.ownerUserPublicId ?? null,
      status: item.status,
      createdAt: now,
      updatedAt: now,
    }
  })
}

export class SprintRetrospectiveService {
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
      throw new SprintRetrospectiveNotFoundError()
    }
    if (sprint.status !== "closed") {
      throw new SprintRetrospectiveValidationError(
        "Sprint retrospective is only available for closed sprints.",
      )
    }
    return sprint
  }

  async getRetrospectiveEnvelope(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
  ): Promise<{ retrospective: SprintRetrospectiveState | null }> {
    const sprint = await this.requireClosedSprint(workspacePublicId, projectPublicId, sprintPublicId)
    return { retrospective: sprint.retrospective }
  }

  async createRetrospective(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
    actorUserPublicId: string,
    body: CreateSprintRetrospectiveBody,
  ): Promise<SprintRetrospectiveState> {
    const sprint = await this.requireClosedSprint(workspacePublicId, projectPublicId, sprintPublicId)
    if (sprint.retrospective) {
      throw new SprintRetrospectiveConflictError()
    }

    const wentWell = (body.wentWell ?? "").trim()
    const didNotGoWell = (body.didNotGoWell ?? "").trim()
    const improvements = (body.improvements ?? "").trim()
    const now = new Date()
    const rawItems = body.actionItems ?? []
    const actionItems: SprintRetrospectiveActionItemState[] = rawItems.map((row) => ({
      actionItemPublicId: randomUUID(),
      text: row.text.trim(),
      ownerUserPublicId: row.ownerUserPublicId ?? null,
      status: row.status ?? "open",
      createdAt: now,
      updatedAt: now,
    }))

    const retrospective: SprintRetrospectiveState = {
      retrospectivePublicId: randomUUID(),
      sprintPublicId,
      projectPublicId,
      workspacePublicId,
      wentWell,
      didNotGoWell,
      improvements,
      actionItems,
      createdByUserPublicId: actorUserPublicId,
      updatedByUserPublicId: actorUserPublicId,
      createdAt: now,
      updatedAt: now,
    }

    await this.sprintRepo.replaceSprint({
      ...sprint,
      retrospective,
      updatedAt: now,
    })

    const saved = await this.sprintRepo.findSprintByPublicId(
      workspacePublicId,
      projectPublicId,
      sprintPublicId,
    )
    if (!saved?.retrospective) {
      throw new Error("sprint_retrospective_missing_after_create")
    }
    return saved.retrospective
  }

  async patchRetrospective(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
    actorUserPublicId: string,
    body: PatchSprintRetrospectiveBody,
  ): Promise<SprintRetrospectiveState> {
    const sprint = await this.requireClosedSprint(workspacePublicId, projectPublicId, sprintPublicId)
    const current = sprint.retrospective
    if (!current) {
      throw new SprintRetrospectiveValidationError(
        "No sprint retrospective exists yet. Use POST to create one.",
      )
    }

    const now = new Date()
    const actionItems =
      body.actionItems !== undefined
        ? mergeActionItemsForPatch(current.actionItems, body.actionItems, now)
        : current.actionItems

    const next: SprintRetrospectiveState = {
      ...current,
      wentWell: body.wentWell !== undefined ? body.wentWell.trim() : current.wentWell,
      didNotGoWell:
        body.didNotGoWell !== undefined ? body.didNotGoWell.trim() : current.didNotGoWell,
      improvements:
        body.improvements !== undefined ? body.improvements.trim() : current.improvements,
      actionItems,
      updatedByUserPublicId: actorUserPublicId,
      updatedAt: now,
    }

    await this.sprintRepo.replaceSprint({
      ...sprint,
      retrospective: next,
      updatedAt: now,
    })

    const saved = await this.sprintRepo.findSprintByPublicId(
      workspacePublicId,
      projectPublicId,
      sprintPublicId,
    )
    if (!saved?.retrospective) {
      throw new Error("sprint_retrospective_missing_after_patch")
    }
    return saved.retrospective
  }
}
