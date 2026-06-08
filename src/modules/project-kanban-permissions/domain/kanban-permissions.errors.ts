/** Lectura de reportes Kanban (v1: política preparada; sin módulo HTTP aún). */
export class KanbanReportsForbiddenError extends Error {
  readonly code = "kanban_reports_forbidden"

  constructor(message = "Not allowed to read Kanban reports.") {
    super(message)
    this.name = "KanbanReportsForbiddenError"
  }
}

/** Configuración de columnas / WIP / políticas de flujo (capacidad restringida). */
export class ProjectKanbanFlowConfigureForbiddenError extends Error {
  readonly code = "kanban_flow_configure_forbidden"

  constructor(message = "Not allowed to configure Kanban flow.") {
    super(message)
    this.name = "ProjectKanbanFlowConfigureForbiddenError"
  }
}
