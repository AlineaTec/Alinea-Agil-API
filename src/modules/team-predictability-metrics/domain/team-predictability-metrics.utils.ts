import type { MethodologyContext } from "../../team-operational-metrics/domain/team-operational-metrics.dto.js"

export function methodologyFlagsFrom(
  byApproach: { scrum: number; kanban: number; other: number },
): MethodologyContext {
  if (byApproach.scrum > 0 && byApproach.kanban > 0) return "mixed"
  if (byApproach.scrum > 0) return "scrum"
  if (byApproach.kanban > 0) return "kanban"
  if (byApproach.other > 0) return "other"
  return "unknown"
}
