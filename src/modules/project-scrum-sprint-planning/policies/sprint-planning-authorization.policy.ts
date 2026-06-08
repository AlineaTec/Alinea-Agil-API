import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import {
  assertCanMutateSprintBoard,
  assertCanReadSprintBoard,
} from "../../project-scrum-sprint-board/policies/sprint-board-authorization.policy.js"

/**
 * Lectura de planning (listar sprints, GET sprint, ítems comprometidos, carryover en respuestas).
 * Alineada a `assertCanReadSprintBoard` para que quien trabaja el tablero (PO, SM, developer, coach…)
 * pueda ver sprints y contexto sin exigir `assertCanReadScrumBacklog`.
 */
export function assertCanReadSprintPlanning(actor: WorkspaceMemberState): void {
  assertCanReadSprintBoard(actor)
}

/**
 * Crear/editar sprint, comprometer ítems, ready, revertir, etc.
 * Familia operativa del sprint: misma que mutación del tablero (SM, PO, agility_lead…),
 * no la mutación conservadora del product backlog.
 */
export function assertCanMutateSprintPlanning(actor: WorkspaceMemberState): void {
  assertCanMutateSprintBoard(actor)
}
