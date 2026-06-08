import type { OperationalApproach } from "../../workspace-project-runtime/domain/operational-approach.js"

export type DailyAlignmentSupportLevel = "full" | "flow_check_in" | "unsupported"

export function supportLevelForOperationalApproach(approach: OperationalApproach): DailyAlignmentSupportLevel {
  if (approach === "scrum") return "full"
  if (approach === "kanban") return "flow_check_in"
  return "unsupported"
}
