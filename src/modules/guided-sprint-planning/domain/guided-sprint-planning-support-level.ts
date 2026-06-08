import type { OperationalApproach } from "../../workspace-project-runtime/domain/operational-approach.js"

export type GuidedSprintPlanningSupportLevel = "full" | "flow_commitment_window" | "unsupported"

export type GuidedSprintPlanningMode = "guided_sprint_planning" | "flow_commitment_window"

export function supportLevelForGuidedSprintPlanning(
  approach: OperationalApproach,
): GuidedSprintPlanningSupportLevel {
  if (approach === "scrum") return "full"
  if (approach === "kanban") return "flow_commitment_window"
  return "unsupported"
}

export function planningModeForApproach(approach: OperationalApproach): GuidedSprintPlanningMode {
  if (approach === "scrum") return "guided_sprint_planning"
  return "flow_commitment_window"
}

export function guidedSprintPlanningOperable(approach: OperationalApproach): boolean {
  return supportLevelForGuidedSprintPlanning(approach) !== "unsupported"
}
