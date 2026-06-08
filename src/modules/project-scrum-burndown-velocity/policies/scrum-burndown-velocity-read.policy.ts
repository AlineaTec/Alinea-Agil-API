/**
 * Burndown (por sprint) y velocity (por proyecto) usan el **mismo** umbral conservador
 * que el tablero y métricas básicas de sprint (`assertCanReadSprintBoard`):
 * admin, operator, auditor, agility_lead, scrum_master, product_owner, scrum_developer, scrum_coach.
 */
export { assertCanReadSprintBoard as assertCanReadScrumBurndownVelocity } from "../../project-scrum-sprint-board/policies/sprint-board-authorization.policy.js"
