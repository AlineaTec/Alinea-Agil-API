import type { InitialConfigurationSummary } from "../../workspace-project-runtime/domain/initial-configuration-summary.js"
import type { OperationalApproach } from "../../workspace-project-runtime/domain/operational-approach.js"
import type { ResolvedFocusCycle } from "./focus-cycle-resolver.js"
import type { WizardStage } from "./wizard-stage.js"
import type { WizardStateBlock } from "./operating-snapshot.dto.js"

const STAGE_LABELS: Record<WizardStage, string> = {
  configure: "Configurar proyecto",
  prepare: "Preparar incremento",
  commit: "Comprometer ciclo",
  execute: "Ejecutar sprint",
  close: "Cerrar incremento",
  improve: "Mejorar y preparar siguiente",
}

const STAGE_ORDER: WizardStage[] = [
  "configure",
  "prepare",
  "commit",
  "execute",
  "close",
  "improve",
]

export function isConfigurationIncomplete(summary: InitialConfigurationSummary): boolean {
  if (!summary.materializationContainerReady) return true
  switch (summary.kind) {
    case "scrum":
      return !summary.backlog || !summary.sprints || !summary.board
    case "kanban":
      return !summary.continuousBoard || !summary.baseColumns
    case "predictive_phases":
      return !summary.phaseStructure
  }
}

export type WizardDerivationInput = {
  approach: OperationalApproach
  configurationSummary: InitialConfigurationSummary
  focusCycle: ResolvedFocusCycle
  hasActiveSprint: boolean
  planningSessionOpen: boolean
  planningSessionClosed: boolean
  dailyTodayClosed: boolean
  reviewPendingForFocus: boolean
  retroPendingForFocus: boolean
  openRetroActionCount: number
  overdueRetroActionCount: number
  backlogReadyCount: number
  archived: boolean
}

export function deriveWizardStage(input: WizardDerivationInput): WizardStage {
  if (input.archived) {
    return input.focusCycle.status === "closed" ? "improve" : "execute"
  }

  if (isConfigurationIncomplete(input.configurationSummary)) {
    return "configure"
  }

  const { focusCycle } = input

  if (input.approach === "kanban") {
    if (focusCycle.kind === "kanban_window" && focusCycle.status === "planning") {
      return "commit"
    }
    if (focusCycle.kind === "none") {
      return input.backlogReadyCount > 0 ? "prepare" : "execute"
    }
    return "execute"
  }

  if (input.approach === "predictive_phases") {
    return focusCycle.kind === "none" ? "prepare" : "execute"
  }

  // Scrum
  if (focusCycle.kind === "none") {
    return input.backlogReadyCount > 0 ? "prepare" : "prepare"
  }

  if (focusCycle.status === "planning") {
    return "commit"
  }

  if (focusCycle.status === "active") {
    // OQ-POS-04: execute wins even if prior sprint review pending
    return "execute"
  }

  if (focusCycle.status === "closed") {
    if (input.reviewPendingForFocus) return "close"
    if (input.retroPendingForFocus) return "improve"
    if (input.openRetroActionCount > 0 || input.overdueRetroActionCount > 0) return "improve"
    if (focusCycle.isStale) return "prepare"
    return "improve"
  }

  return "prepare"
}

function buildStageSummary(stage: WizardStage, focusCycle: ResolvedFocusCycle): string {
  switch (stage) {
    case "configure":
      return "Completa la configuración operativa del proyecto."
    case "prepare":
      return "Prepara backlog y refinement antes del próximo compromiso."
    case "commit":
      return focusCycle.displayName
        ? `Planifica y compromete ${focusCycle.displayName}.`
        : "Abre o continúa la planning del ciclo."
    case "execute":
      return focusCycle.displayName
        ? `${focusCycle.displayName} en ejecución.`
        : "Ejecuta el trabajo del ciclo activo."
    case "close":
      return focusCycle.displayName
        ? `Inspecciona el incremento de ${focusCycle.displayName}.`
        : "Realiza la review del ciclo cerrado."
    case "improve":
      return "Cierra retrospectiva y acciones de mejora."
  }
}

export function buildWizardState(stage: WizardStage, focusCycle: ResolvedFocusCycle): WizardStateBlock {
  const idx = STAGE_ORDER.indexOf(stage)
  return {
    stage,
    stageLabel: STAGE_LABELS[stage],
    stageSummary: buildStageSummary(stage, focusCycle),
    previousStage: idx > 0 ? STAGE_ORDER[idx - 1]! : null,
    nextStage: idx < STAGE_ORDER.length - 1 ? STAGE_ORDER[idx + 1]! : null,
    derivationVersion: "wizard-derivation-v1",
  }
}
