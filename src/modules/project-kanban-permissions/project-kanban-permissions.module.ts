/**
 * Capa explícita de permisos Kanban v1 (capabilities + evaluación rol × capacidad).
 * Los slices `project-kanban-backlog`, `project-kanban-board`, `project-kanban-metrics` delegan aquí.
 */
export { KANBAN_CAPABILITY, type KanbanCapability } from "./domain/kanban-capability.js"
export {
  ProjectKanbanFlowConfigureForbiddenError,
  KanbanReportsForbiddenError,
} from "./domain/kanban-permissions.errors.js"
export {
  kanbanMemberHasCapability,
  kanbanMemberHasBacklogRead,
  kanbanMemberHasBacklogEdit,
  kanbanMemberHasBacklogRank,
  kanbanMemberHasReleaseToFlow,
  kanbanMemberHasBoardRead,
  kanbanMemberHasBoardMove,
  kanbanMemberHasBoardReturnToBacklog,
  kanbanMemberHasBoardBlock,
  kanbanMemberHasFlowConfigure,
  kanbanMemberHasEventsRead,
  kanbanMemberHasMetricsRead,
  kanbanMemberHasReportsRead,
} from "./policies/kanban-member-capabilities.policy.js"
export { assertCanConfigureKanbanFlow } from "./policies/kanban-flow-configure.policy.js"
export { assertCanReadKanbanReports } from "./policies/kanban-reports-read.policy.js"
