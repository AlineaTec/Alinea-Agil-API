import type { OperationalApproach } from "../../workspace-project-runtime/domain/operational-approach.js"

export type GuidedRetrospectiveSupportLevel = "full" | "flow_retrospective" | "unsupported"

/** Scrum = full; Kanban = same structural retro without sprint artificial; predictive = not operable for writes (OQ-GRETRO-18). */
export function supportLevelForGuidedRetrospective(approach: OperationalApproach): GuidedRetrospectiveSupportLevel {
  if (approach === "scrum") return "full"
  if (approach === "kanban") return "flow_retrospective"
  return "unsupported"
}
