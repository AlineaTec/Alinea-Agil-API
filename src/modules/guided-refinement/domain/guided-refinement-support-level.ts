import type { OperationalApproach } from "../../workspace-project-runtime/domain/operational-approach.js"

/** Nomenclatura lista / siguiente compromiso (OQ-GRF-13). */
export type GuidedRefinementReadyNomenclature = "ready_for_planning" | "ready_for_next_commitment"

export type GuidedRefinementSupportLevel = "full" | "flow_refinement" | "unsupported"

export function supportLevelForGuidedRefinement(approach: OperationalApproach): GuidedRefinementSupportLevel {
  if (approach === "scrum") return "full"
  if (approach === "kanban") return "flow_refinement"
  return "unsupported"
}

export function readyNomenclatureForApproach(approach: OperationalApproach): GuidedRefinementReadyNomenclature {
  if (approach === "scrum") return "ready_for_planning"
  if (approach === "kanban") return "ready_for_next_commitment"
  return "ready_for_next_commitment"
}
