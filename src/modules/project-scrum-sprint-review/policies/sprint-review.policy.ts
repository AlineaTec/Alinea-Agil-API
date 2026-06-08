/**
 * Sprint Review — permisos MVP (contracts-docs `project-scrum-sprint-review`):
 * - **Lectura:** misma familia que lectura del board / métricas (`assertCanReadSprintBoard`).
 * - **Mutación (POST/PATCH):** misma familia que cierre y board (`assertCanMutateSprintBoard`).
 */
export {
  assertCanMutateSprintBoard as assertCanMutateSprintReview,
  assertCanReadSprintBoard as assertCanReadSprintReview,
} from "../../project-scrum-sprint-board/policies/sprint-board-authorization.policy.js"
