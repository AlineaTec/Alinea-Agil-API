import type { OperationalApproach } from "./operational-approach.js"

/**
 * Resumen superficial para home / summary: qué piezas del modelo operativo están reconocidas.
 * Valores boolean indican si el submódulo está persistido y operativo en el producto actual.
 */
export type ScrumInitialConfigurationSummary = {
  kind: "scrum"
  /** `true` tras materializar el contenedor operativo (fila en `WorkspaceRuntimeProject`). */
  materializationContainerReady: boolean
  backlog: boolean
  sprints: boolean
  board: boolean
  baseWorkItemTypes: boolean
  baseMetrics: boolean
}

export type KanbanInitialConfigurationSummary = {
  kind: "kanban"
  materializationContainerReady: boolean
  continuousBoard: boolean
  baseColumns: boolean
  wipPolicies: boolean
  baseMetrics: boolean
}

export type PredictivePhasesInitialConfigurationSummary = {
  kind: "predictive_phases"
  materializationContainerReady: boolean
  phaseStructure: boolean
  milestones: boolean
  dependencies: boolean
  approvals: boolean
}

export type InitialConfigurationSummary =
  | ScrumInitialConfigurationSummary
  | KanbanInitialConfigurationSummary
  | PredictivePhasesInitialConfigurationSummary

export function defaultInitialConfigurationSummary(
  approach: OperationalApproach,
): InitialConfigurationSummary {
  switch (approach) {
    case "scrum":
      return {
        kind: "scrum",
        materializationContainerReady: false,
        backlog: false,
        sprints: false,
        board: false,
        baseWorkItemTypes: false,
        baseMetrics: false,
      }
    case "kanban":
      return {
        kind: "kanban",
        materializationContainerReady: false,
        continuousBoard: false,
        baseColumns: false,
        wipPolicies: false,
        baseMetrics: false,
      }
    case "predictive_phases":
      return {
        kind: "predictive_phases",
        materializationContainerReady: false,
        phaseStructure: false,
        milestones: false,
        dependencies: false,
        approvals: false,
      }
  }
}

/**
 * Resumen al crear el runtime: contenedor persistido y flags alineados a lo ya soportado en API/web.
 */
export function initialConfigurationSummaryAfterMaterialization(
  approach: OperationalApproach,
): InitialConfigurationSummary {
  switch (approach) {
    case "scrum":
      return {
        kind: "scrum",
        materializationContainerReady: true,
        backlog: true,
        sprints: true,
        board: true,
        baseWorkItemTypes: true,
        baseMetrics: true,
      }
    case "kanban":
      return {
        kind: "kanban",
        materializationContainerReady: true,
        /** Alineado a `board` en Scrum: API y web ya exponen tablero de flujo continuo. */
        continuousBoard: true,
        baseColumns: true,
        wipPolicies: true,
        baseMetrics: true,
      }
    case "predictive_phases":
      return {
        kind: "predictive_phases",
        materializationContainerReady: true,
        phaseStructure: true,
        milestones: false,
        dependencies: false,
        approvals: false,
      }
  }
}
