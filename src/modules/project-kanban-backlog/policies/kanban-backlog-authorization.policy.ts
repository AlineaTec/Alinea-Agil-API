import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import {
  kanbanMemberHasBacklogEdit,
  kanbanMemberHasBacklogRank,
  kanbanMemberHasBacklogRead,
  kanbanMemberHasReleaseToFlow,
} from "../../project-kanban-permissions/policies/kanban-member-capabilities.policy.js"
import { KanbanBacklogForbiddenError } from "../domain/kanban-backlog.errors.js"

function assertActiveForBacklog(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated") {
    throw new KanbanBacklogForbiddenError("Deactivated members cannot access the Kanban backlog.")
  }
}

/** `kanban.backlog.read` */
export function assertCanReadKanbanBacklog(actor: WorkspaceMemberState): void {
  assertActiveForBacklog(actor)
  if (!kanbanMemberHasBacklogRead(actor)) {
    throw new KanbanBacklogForbiddenError(
      "Only admin, operator, auditor, agility_lead, scrum_coach, product_owner, scrum_master, or scrum_developer may read the Kanban backlog.",
    )
  }
}

/** `kanban.backlog.edit` */
export function assertCanMutateKanbanBacklogContent(actor: WorkspaceMemberState): void {
  assertActiveForBacklog(actor)
  if (!kanbanMemberHasBacklogEdit(actor)) {
    throw new KanbanBacklogForbiddenError(
      "Only admin, operator, agility_lead, product_owner, scrum_master, or scrum_developer may create or edit Kanban backlog items.",
    )
  }
}

/** `kanban.backlog.rank` */
export function assertCanRankKanbanBacklog(actor: WorkspaceMemberState): void {
  assertActiveForBacklog(actor)
  if (!kanbanMemberHasBacklogRank(actor)) {
    throw new KanbanBacklogForbiddenError(
      "Only admin, operator, agility_lead, product_owner, or scrum_master may reorder the Kanban backlog.",
    )
  }
}

/** `kanban.release_to_flow` */
export function assertCanReleaseToFlow(actor: WorkspaceMemberState): void {
  assertActiveForBacklog(actor)
  if (!kanbanMemberHasReleaseToFlow(actor)) {
    throw new KanbanBacklogForbiddenError(
      "Only admin, operator, agility_lead, product_owner, or scrum_master may release items to the Kanban flow.",
    )
  }
}

/**
 * Familia histórica: rank + release + return (misma frontera efectiva).
 * Preferir asserts específicos (`assertCanRankKanbanBacklog`, `assertCanReleaseToFlow`,
 * `assertCanReturnKanbanBoardItemsToBacklog`) en código nuevo.
 */
export function assertCanPrioritizeKanbanBacklog(actor: WorkspaceMemberState): void {
  assertActiveForBacklog(actor)
  if (!kanbanMemberHasBacklogRank(actor)) {
    throw new KanbanBacklogForbiddenError(
      "Only admin, operator, agility_lead, product_owner, or scrum_master may reorder, release, or return Kanban backlog items.",
    )
  }
}
