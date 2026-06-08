import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { KanbanReportsForbiddenError } from "../domain/kanban-permissions.errors.js"
import { kanbanMemberHasReportsRead } from "./kanban-member-capabilities.policy.js"

/** Capacidad `kanban.reports.read` (v1: equivalente efectivo a `kanban.metrics.read`). */
export function assertCanReadKanbanReports(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated") {
    throw new KanbanReportsForbiddenError("Deactivated members cannot read Kanban reports.")
  }
  if (!kanbanMemberHasReportsRead(actor)) {
    throw new KanbanReportsForbiddenError(
      "Only admin, operator, auditor, agility_lead, scrum_master, product_owner, scrum_developer, or scrum_coach may read Kanban reports.",
    )
  }
}
