import type { OperationalApproach } from "../../workspace-project-runtime/domain/operational-approach.js"
import type {
  WorkControlEventCode,
  WorkControlSeverityLevel,
  WorkControlV1RuleId,
} from "./work-ready-done-controls.constants.js"

export type WorkControlsDefinitionSource = "system_default" | "workspace_template" | "project"

export type WorkControlCriterionConfig = {
  ruleId: WorkControlV1RuleId
  isEnabled: boolean
  level: WorkControlSeverityLevel
}

/**
 * Mapeo explícito Kanban (OQ-15). Nulos = no se aplica la evaluación con bloqueo por traslado a esa columna
 * hasta que se configure; read-only informativo en UI vía evaluación.
 */
export type WorkControlsKanbanColumnMapping = {
  /** Transición a “trabajo activo / entrada al flujo” (ready_start_execution) */
  startExecutionColumnPublicId: string | null
  /** Columna que representa cierre (done_close_item) vía movimiento a tablero */
  doneCloseItemColumnPublicId: string | null
}

export type WorkControlsProjectProfileState = {
  workspacePublicId: string
  projectPublicId: string
  /**
   * Debe alinear con `operationalApproach` del runtime (scrum | kanban).
   * predictive_phases: fuera de v1.
   */
  approach: "scrum" | "kanban"
  version: number
  definitionSource: WorkControlsDefinitionSource
  criteria: WorkControlCriterionConfig[]
  /** Solo Kanban; omitido o nulls en Scrum */
  kanbanColumnMapping: WorkControlsKanbanColumnMapping
  createdAt: Date
  updatedAt: Date
}

export type WorkControlsTemplateState = {
  workspacePublicId: string
  version: number
  criteria: WorkControlCriterionConfig[]
  createdAt: Date
  updatedAt: Date
}

export type CriterionEvaluationRow = {
  ruleId: WorkControlV1RuleId
  level: WorkControlSeverityLevel
  isEnabled: boolean
  notApplicable: boolean
  pass: boolean
  /** Código de mensaje estable (cliente mapea copy) */
  messageCode: string
}

export type WorkControlsEvaluationResult = {
  eventCode: WorkControlEventCode
  workItemPublicId: string
  projectPublicId: string
  approach: "scrum" | "kanban"
  criteria: CriterionEvaluationRow[]
  /**
   * Agregado: block gana; si no, warn; informativo no bloquea.
   */
  effectiveLevel: "pass" | "informational" | "warning" | "blocking"
  canContinue: boolean
  /** Si hubo criterio warning no cumplido (eventos de alto impacto en UI) */
  requiresAcknowledgment: boolean
  /** Si sigue en bloqueo, override es la única vía (roles restringidos) */
  canResolveWithOverride: boolean
  failedBlockingRuleIds: string[]
  failedWarningRuleIds: string[]
}

export type OperationalApproachForControls = Extract<OperationalApproach, "scrum" | "kanban">
