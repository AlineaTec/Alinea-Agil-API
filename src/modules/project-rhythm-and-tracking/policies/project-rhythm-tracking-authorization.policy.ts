import { assertCanReadKanbanMetrics } from "../../project-kanban-metrics/policies/kanban-metrics-authorization.policy.js"
import { assertCanReadSprintBoard } from "../../project-scrum-sprint-board/policies/sprint-board-authorization.policy.js"
import { assertCanReadProjectRuntime } from "../../workspace-project-runtime/policies/project-runtime-authorization.policy.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { ProjectRhythmTrackingForbiddenError } from "../domain/project-rhythm-tracking.errors.js"

function tryReadSprintBoard(actor: WorkspaceMemberState): boolean {
  try {
    assertCanReadSprintBoard(actor)
    return true
  } catch {
    return false
  }
}

function tryReadKanbanMetrics(actor: WorkspaceMemberState): boolean {
  try {
    assertCanReadKanbanMetrics(actor)
    return true
  } catch {
    return false
  }
}

function tryReadProjectRuntime(actor: WorkspaceMemberState): boolean {
  try {
    assertCanReadProjectRuntime(actor)
    return true
  } catch {
    return false
  }
}

/**
 * Unión conservadora: quien lee tablero Sprint, métricas Kanban o runtime del proyecto.
 * Evita exigir `assertCanReadProjectRuntime` a perfiles que ya leen burndown/velocity (p. ej. developer).
 */
export function assertCanReadProjectRhythmTracking(actor: WorkspaceMemberState): void {
  if (tryReadSprintBoard(actor) || tryReadKanbanMetrics(actor) || tryReadProjectRuntime(actor)) {
    return
  }
  throw new ProjectRhythmTrackingForbiddenError()
}
