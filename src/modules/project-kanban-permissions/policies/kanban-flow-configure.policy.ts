import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { ProjectKanbanFlowConfigureForbiddenError } from "../domain/kanban-permissions.errors.js"
import { kanbanMemberHasFlowConfigure } from "./kanban-member-capabilities.policy.js"

/** Capacidad `kanban.flow.configure` (endpoints de mutación de flujo cuando existan). */
export function assertCanConfigureKanbanFlow(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated") {
    throw new ProjectKanbanFlowConfigureForbiddenError("Deactivated members cannot configure Kanban flow.")
  }
  if (!kanbanMemberHasFlowConfigure(actor)) {
    throw new ProjectKanbanFlowConfigureForbiddenError(
      "Only workspace admin or operator may configure Kanban flow columns and policies.",
    )
  }
}
