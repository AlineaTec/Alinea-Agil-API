import type { OperatingSnapshotService } from "../../project-operating-snapshot/services/operating-snapshot.service.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type { ProjectDraftService } from "../../workspace-projects/services/project-draft.service.js"
import type { ProjectRuntimeService, ProjectRuntimeSummaryDto } from "./project-runtime.service.js"

export type ProjectPageBootstrapOperatingSnapshotLite = {
  roleProjection: {
    viewerRole: string
    hubLayoutVariant: string
    accessLevel: string
  }
  wizardStage: string
  focusCycle: {
    kind: string
    publicId: string | null
    status: string
    displayName: string | null
  }
  refreshMeta: {
    generatedAt: string
    expiresAt: string
    partial: boolean
  }
}

export type ProjectPageBootstrapDto = {
  summary: ProjectRuntimeSummaryDto & { charterSummary: unknown }
  operatingSnapshotLite: ProjectPageBootstrapOperatingSnapshotLite
  operationalApproach: ProjectRuntimeSummaryDto["operationalApproach"]
  boardSprintPublicId: string | null
  scrumSprints: Array<{
    sprintPublicId: string
    name: string
    status: string
    startDate: string | null
    endDate: string | null
  }>
}

function pickBoardSprintPublicId(
  sprints: Array<{ sprintPublicId: string; status: string }>,
): string | null {
  const active = sprints.find((s) => s.status === "active")
  if (active) return active.sprintPublicId
  const ready = sprints.find((s) => s.status === "ready_for_execution")
  if (ready) return ready.sprintPublicId
  const planning = sprints.find((s) => s.status === "planning")
  if (planning) return planning.sprintPublicId
  return sprints[0]?.sprintPublicId ?? null
}

export class ProjectPageBootstrapService {
  constructor(
    private readonly projectRuntime: ProjectRuntimeService,
    private readonly projectDraft: ProjectDraftService,
    private readonly operatingSnapshot: OperatingSnapshotService,
    private readonly sprintRepo: ScrumSprintPlanningRepository,
  ) {}

  async getPageBootstrap(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<ProjectPageBootstrapDto> {
    const summary = await this.projectRuntime.getProjectRuntimeSummary(actor, workspacePublicId, projectPublicId)
    const charterByDraft = await this.projectDraft.getCharterSnapshotsByDraftIds(workspacePublicId, [
      summary.sourceDraftPublicId,
    ])

    const snapshot = await this.operatingSnapshot.getOperatingSnapshot(actor, workspacePublicId, projectPublicId, {
      includeCalendarExtract: false,
    })

    let scrumSprints: ProjectPageBootstrapDto["scrumSprints"] = []
    let boardSprintPublicId: string | null = null
    if (summary.operationalApproach === "scrum") {
      const rows = await this.sprintRepo.listSprintsByProject(workspacePublicId, projectPublicId)
      scrumSprints = rows.map((s) => ({
        sprintPublicId: s.sprintPublicId,
        name: s.name,
        status: s.status,
        startDate: s.startDate ? s.startDate.toISOString() : null,
        endDate: s.endDate ? s.endDate.toISOString() : null,
      }))
      boardSprintPublicId = pickBoardSprintPublicId(scrumSprints)
    }

    return {
      summary: {
        ...summary,
        charterSummary: charterByDraft.get(summary.sourceDraftPublicId) ?? null,
      },
      operatingSnapshotLite: {
        roleProjection: {
          viewerRole: snapshot.roleProjection.viewerRole,
          hubLayoutVariant: snapshot.roleProjection.hubLayoutVariant,
          accessLevel: snapshot.projectContext.viewerAccessLevel,
        },
        wizardStage: snapshot.wizardState.stage,
        focusCycle: {
          kind: snapshot.focusCycle.kind,
          publicId: snapshot.focusCycle.publicId,
          status: snapshot.focusCycle.status,
          displayName: snapshot.focusCycle.displayName,
        },
        refreshMeta: {
          generatedAt: snapshot.refreshMeta.generatedAt,
          expiresAt: snapshot.refreshMeta.expiresAt,
          partial: snapshot.refreshMeta.partial,
        },
      },
      operationalApproach: summary.operationalApproach,
      boardSprintPublicId,
      scrumSprints,
    }
  }
}
