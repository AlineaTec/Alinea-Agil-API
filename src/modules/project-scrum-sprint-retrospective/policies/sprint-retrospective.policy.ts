/**
 * Sprint Retrospective — permisos MVP (paridad con `project-scrum-sprint-review`):
 * lectura y mutación alineadas a board/cierre/review.
 */
export {
  assertCanMutateSprintBoard as assertCanMutateSprintRetrospective,
  assertCanReadSprintBoard as assertCanReadSprintRetrospective,
} from "../../project-scrum-sprint-board/policies/sprint-board-authorization.policy.js"
