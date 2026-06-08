import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { KanbanBoardForbiddenError, KanbanWipOverrideForbiddenError } from "../../project-kanban-board/domain/kanban-board.errors.js"
import {
  kanbanMemberHasWipManage,
  kanbanMemberHasWipOverride,
  kanbanMemberHasWipRead,
} from "../../project-kanban-permissions/policies/kanban-member-capabilities.policy.js"

/**
 * v1: lectura de WIP: `kanban.wip.read` (misma amplitud que `kanban.board.read`).
 */
export function assertCanReadKanbanWip(actor: WorkspaceMemberState): void {
  if (!kanbanMemberHasWipRead(actor)) {
    throw new KanbanBoardForbiddenError("Not allowed to read Kanban WIP settings.")
  }
}

/**
 * v1: configuración WIP: `kanban.wip.manage`.
 */
export function assertCanManageKanbanWip(actor: WorkspaceMemberState): void {
  if (!kanbanMemberHasWipManage(actor)) {
    throw new KanbanBoardForbiddenError("Not allowed to manage Kanban WIP settings.")
  }
}

export function canKanbanWipOverrideRole(actor: WorkspaceMemberState): boolean {
  return kanbanMemberHasWipOverride(actor)
}

export function assertCanKanbanWipOverride(actor: WorkspaceMemberState): void {
  if (!kanbanMemberHasWipOverride(actor)) {
    throw new KanbanWipOverrideForbiddenError()
  }
}
