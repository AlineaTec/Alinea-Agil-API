import type { WorkspaceRuntimeProjectState } from "../../workspace-project-runtime/domain/workspace-runtime-project.js"
import type { WorkTeamState } from "../../workspace-work-teams/domain/work-team.js"
import type { MethodologyContext } from "../domain/team-flow-delivery-metrics.dto.js"
import { methodologyFlagsFrom } from "../domain/team-flow-delivery-metrics.constants.js"
import type { TeamFlowDeliverySummaryJson, FlowMetricsPeriod } from "../domain/team-flow-delivery-metrics.dto.js"

export function loadMethodologyForProjects(
  byProject: Map<string, WorkspaceRuntimeProjectState>,
  projectIds: string[],
): MethodologyContext {
  const flags = { scrum: 0, kanban: 0, other: 0 }
  for (const pid of projectIds) {
    const p = byProject.get(pid)
    if (!p) continue
    if (p.operationalApproach === "scrum") flags.scrum += 1
    else if (p.operationalApproach === "kanban") flags.kanban += 1
    else flags.other += 1
  }
  return methodologyFlagsFrom(flags)
}

export function toSummaryBase(
  team: WorkTeamState,
  projectIds: string[],
  methodology: MethodologyContext,
  period: FlowMetricsPeriod,
  rest: Omit<
    TeamFlowDeliverySummaryJson,
    | "teamPublicId"
    | "teamName"
    | "teamStatus"
    | "teamLeadUserPublicId"
    | "linkedProjectsCount"
    | "linkedProjectPublicIds"
    | "methodologyContext"
    | "period"
  >,
): TeamFlowDeliverySummaryJson {
  return {
    teamPublicId: team.teamPublicId,
    teamName: team.name,
    teamStatus: team.status,
    teamLeadUserPublicId: team.teamLeadUserPublicId,
    linkedProjectsCount: projectIds.length,
    linkedProjectPublicIds: projectIds,
    methodologyContext: methodology,
    period,
    ...rest,
  }
}
