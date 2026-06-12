import type { ScrumCarryoverDerivationService } from "../../project-scrum-carryover/services/scrum-carryover-derivation.service.js"
import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import { assertCanReadProjectRuntime } from "../../workspace-project-runtime/policies/project-runtime-authorization.policy.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type { RoadmapSummaryDto, RoadmapWorkItemRow } from "../domain/roadmap-summary.types.js"
import { buildRoadmapSummary } from "./roadmap-summary.builder.js"

export class RoadmapSummaryService {
  constructor(
    private readonly projectRuntimeService: ProjectRuntimeService,
    private readonly backlogRepo: ScrumBacklogRepository,
    private readonly sprintRepo: ScrumSprintPlanningRepository,
    private readonly carryoverDerivation: ScrumCarryoverDerivationService,
  ) {}

  async getSummary(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    windowParam: string,
    cycleActive: boolean,
  ): Promise<RoadmapSummaryDto> {
    assertCanReadProjectRuntime(actor)
    const runtime = await this.projectRuntimeService.getProjectRuntimeSummary(actor, workspacePublicId, projectPublicId)
    const approach = runtime.operationalApproach

    const rawItems = await this.backlogRepo.listRoadmapWorkItems(workspacePublicId, projectPublicId)
    const carryMap = await this.carryoverDerivation.deriveForBacklogItems(
      workspacePublicId,
      projectPublicId,
      rawItems.map((i) => i.backlogItemPublicId),
    )
    const items: RoadmapWorkItemRow[] = rawItems.map((row) => {
      const carry = carryMap.get(row.backlogItemPublicId)
      return {
        ...row,
        isCarryover: carry?.isCarryover ?? false,
        lastNotCompletedSprintPublicId: carry?.lastNotCompletedSprintPublicId ?? null,
        lastNotCompletedSprintName: carry?.lastNotCompletedSprintName ?? null,
        lastNotCompletedClosedAt: carry?.lastNotCompletedClosedAt ?? null,
      }
    })

    const committedBacklogIds = new Set<string>()
    const itemCommittedSprintIds = new Map<string, string[]>()
    let sprints = approach === "scrum" ? await this.sprintRepo.listSprintsByProject(workspacePublicId, projectPublicId) : []

    if (approach === "scrum") {
      for (const sprint of sprints) {
        const memberships = await this.sprintRepo.listMembershipsBySprintOrdered(
          workspacePublicId,
          projectPublicId,
          sprint.sprintPublicId,
        )
        for (const m of memberships) {
          committedBacklogIds.add(m.backlogItemPublicId)
          const existing = itemCommittedSprintIds.get(m.backlogItemPublicId) ?? []
          if (!existing.includes(sprint.sprintPublicId)) {
            itemCommittedSprintIds.set(m.backlogItemPublicId, [...existing, sprint.sprintPublicId])
          }
        }
      }
    }

    return buildRoadmapSummary({
      windowParam,
      items,
      committedBacklogIds,
      cycleActive,
      sprints,
      itemCommittedSprintIds,
    })
  }
}
