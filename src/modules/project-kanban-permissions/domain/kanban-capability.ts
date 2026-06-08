/**
 * Catálogo semántico de capacidades Kanban v1 (agnóstico de sprint).
 * Ver `README.md` y contracts-docs `project-kanban-permissions`.
 */
export const KANBAN_CAPABILITY = {
  BACKLOG_READ: "kanban.backlog.read",
  BACKLOG_EDIT: "kanban.backlog.edit",
  BACKLOG_RANK: "kanban.backlog.rank",
  RELEASE_TO_FLOW: "kanban.release_to_flow",
  BOARD_READ: "kanban.board.read",
  BOARD_MOVE: "kanban.board.move",
  BOARD_RETURN_TO_BACKLOG: "kanban.board.return_to_backlog",
  BOARD_BLOCK: "kanban.board.block",
  FLOW_CONFIGURE: "kanban.flow.configure",
  EVENTS_READ: "kanban.events.read",
  METRICS_READ: "kanban.metrics.read",
  REPORTS_READ: "kanban.reports.read",
  WIP_READ: "kanban.wip.read",
  WIP_MANAGE: "kanban.wip.manage",
  WIP_OVERRIDE: "kanban.wip.override",
  /** Mismo dominio de lectura que `METRICS_READ` (contracts: `flow-time.read`). */
  FLOW_TIME_READ: "kanban.flow_time.read",
  /** Detalle por ítem con títulos; auditor excluido (contracts: `flow-time.detail.read`). */
  FLOW_TIME_DETAIL_READ: "kanban.flow_time.detail.read",
} as const

export type KanbanCapability = (typeof KANBAN_CAPABILITY)[keyof typeof KANBAN_CAPABILITY]
