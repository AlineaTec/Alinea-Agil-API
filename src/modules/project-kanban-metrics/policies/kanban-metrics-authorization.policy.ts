import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { kanbanMemberHasMetricsRead } from "../../project-kanban-permissions/policies/kanban-member-capabilities.policy.js"
import { KanbanMetricsForbiddenError } from "../domain/kanban-metrics.errors.js"

/** `kanban.metrics.read` */
export function assertCanReadKanbanMetrics(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated") {
    throw new KanbanMetricsForbiddenError("Deactivated members cannot read Kanban metrics.")
  }
  if (!kanbanMemberHasMetricsRead(actor)) {
    throw new KanbanMetricsForbiddenError(
      "Only admin, operator, auditor, agility_lead, scrum_master, product_owner, scrum_developer, or scrum_coach may read Kanban metrics.",
    )
  }
}
