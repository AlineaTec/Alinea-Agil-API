import { kanbanMemberHasFlowTimeRead } from "../../project-kanban-permissions/policies/kanban-member-capabilities.policy.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { FlowTimeForbiddenError } from "../domain/flow-time.errors.js"

export function assertCanReadFlowTimeSummary(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated") {
    throw new FlowTimeForbiddenError("Deactivated members cannot read flow time.")
  }
  if (!kanbanMemberHasFlowTimeRead(actor)) {
    throw new FlowTimeForbiddenError("Not allowed to read flow time (requires kanban.metrics.read / flow-time.read).")
  }
}
