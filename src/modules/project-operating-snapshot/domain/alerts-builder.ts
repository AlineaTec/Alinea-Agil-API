import type { OperationalApproach } from "../../workspace-project-runtime/domain/operational-approach.js"
import type { ScrumSprintState } from "../../project-scrum-sprint-planning/domain/scrum-sprint.js"
import type { OperatingAlert } from "./operating-snapshot.dto.js"
import type { WizardStage } from "./wizard-stage.js"
import type { ResolvedFocusCycle } from "./focus-cycle-resolver.js"
import { MAX_ALERTS_IN_RESPONSE } from "./wizard-stage.js"
import {
  deepLinkImpediments,
  deepLinkPlanning,
  deepLinkReview,
  deepLinkRetro,
  deepLinkRetroActions,
  deepLinkDaily,
  deepLinkScrumSprints,
} from "./deep-links.js"

export type AlertsBuildInput = {
  projectPublicId: string
  approach: OperationalApproach
  wizardStage: WizardStage
  focusCycle: ResolvedFocusCycle
  criticalImpedimentCount: number
  planningSessionOpen: boolean
  planningWarningCount: number
  sprintStuckInPlanning: boolean
  missingBaseline: boolean
  reviewPendingSprint: ScrumSprintState | null
  retroPendingAfterReview: boolean
  dailyPendingToday: boolean
  dailyPendingThresholdReached: boolean
  overdueRetroActionCount: number
  prepareStale: boolean
  setupIncomplete: boolean
  hasAnySprint: boolean
}

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, info: 3 } as const

export function buildAlerts(input: AlertsBuildInput): OperatingAlert[] {
  const alerts: OperatingAlert[] = []
  let sort = 0

  const push = (alert: Omit<OperatingAlert, "sortOrder">) => {
    alerts.push({ ...alert, sortOrder: sort++ })
  }

  if (input.criticalImpedimentCount > 0) {
    push({
      alertId: "ALERT_CRITICAL_IMPEDIMENT",
      severity: "critical",
      category: "operational",
      title: "Impedimentos críticos abiertos",
      message: `Hay ${input.criticalImpedimentCount} impedimento(s) crítico(s) sin resolver.`,
      relatedStage: input.wizardStage,
      relatedRitual: null,
      actionHint: "address_critical_alert",
      deepLinkPath: deepLinkImpediments(input.projectPublicId),
    })
  }

  if (input.setupIncomplete) {
    push({
      alertId: "ALERT_SETUP_INCOMPLETE",
      severity: "high",
      category: "setup",
      title: "Configuración incompleta",
      message: "El proyecto necesita completar su configuración operativa.",
      relatedStage: "configure",
      relatedRitual: null,
      actionHint: "complete_setup",
      deepLinkPath: deepLinkScrumSprints(input.projectPublicId),
    })
  }

  if (input.approach === "scrum" && !input.hasAnySprint) {
    push({
      alertId: "ALERT_NO_ACTIVE_SPRINT",
      severity: "high",
      category: "ceremonial",
      title: "Sin sprint en curso",
      message: "Aún no hay sprint activo ni en planificación.",
      relatedStage: input.wizardStage,
      relatedRitual: "planning",
      actionHint: "open_planning",
      deepLinkPath: deepLinkScrumSprints(input.projectPublicId),
    })
  }

  if (input.reviewPendingSprint) {
    push({
      alertId: "ALERT_REVIEW_PENDING",
      severity: "high",
      category: "ceremonial",
      title: "Review pendiente",
      message: `Review pendiente de ${input.reviewPendingSprint.name}.`,
      relatedStage: "close",
      relatedRitual: "review",
      actionHint: "close_review",
      deepLinkPath: deepLinkReview(input.projectPublicId),
    })
  }

  if (input.retroPendingAfterReview) {
    push({
      alertId: "ALERT_RETRO_PENDING",
      severity: "high",
      category: "ceremonial",
      title: "Retrospectiva pendiente",
      message: "La retrospectiva del ciclo aún no se ha realizado.",
      relatedStage: "improve",
      relatedRitual: "retro",
      actionHint: "open_retro",
      deepLinkPath: deepLinkRetro(input.projectPublicId),
    })
  }

  if (input.overdueRetroActionCount > 0) {
    push({
      alertId: "ALERT_RETRO_ACTIONS_OVERDUE",
      severity: "high",
      category: "temporal",
      title: "Acciones de mejora vencidas",
      message: `${input.overdueRetroActionCount} acción(es) de retrospectiva vencida(s).`,
      relatedStage: "improve",
      relatedRitual: "retroActions",
      actionHint: "review_overdue_actions",
      deepLinkPath: deepLinkRetroActions(input.projectPublicId),
    })
  }

  if (input.sprintStuckInPlanning) {
    push({
      alertId: "ALERT_SPRINT_STUCK_PLANNING",
      severity: "high",
      category: "methodological",
      title: "Sprint sin iniciar",
      message: "Planning cerrada; falta iniciar el sprint.",
      relatedStage: "commit",
      relatedRitual: "planning",
      actionHint: "start_sprint",
      deepLinkPath: deepLinkScrumSprints(input.projectPublicId),
    })
  }

  if (input.focusCycle.status === "active" && input.focusCycle.daysRemaining != null && input.focusCycle.daysRemaining <= 3) {
    push({
      alertId: "ALERT_SPRINT_ENDING_SOON",
      severity: "medium",
      category: "temporal",
      title: "Sprint termina pronto",
      message:
        input.focusCycle.daysRemaining === 0
          ? "El sprint termina hoy."
          : `Quedan ${input.focusCycle.daysRemaining} día(s) de sprint.`,
      relatedStage: "execute",
      relatedRitual: null,
      actionHint: null,
      deepLinkPath: deepLinkScrumSprints(input.projectPublicId),
    })
  }

  if (input.focusCycle.status === "active" && input.focusCycle.daysRemaining != null && input.focusCycle.daysRemaining < 0) {
    push({
      alertId: "ALERT_SPRINT_OVERDUE",
      severity: "high",
      category: "temporal",
      title: "Sprint superó fecha de fin",
      message: "La fecha de fin del sprint ya pasó.",
      relatedStage: "execute",
      relatedRitual: null,
      actionHint: null,
      deepLinkPath: deepLinkScrumSprints(input.projectPublicId),
    })
  }

  if (input.planningSessionOpen) {
    push({
      alertId: "ALERT_PLANNING_OPEN",
      severity: "medium",
      category: "ceremonial",
      title: "Planning en progreso",
      message: "Hay una sesión de planning abierta.",
      relatedStage: "commit",
      relatedRitual: "planning",
      actionHint: "open_planning",
      deepLinkPath: deepLinkPlanning(input.projectPublicId),
    })
  }

  if (input.planningWarningCount > 0) {
    push({
      alertId: "ALERT_PLANNING_WARNINGS",
      severity: "medium",
      category: "methodological",
      title: "Advertencias en planning",
      message: `La planning tiene ${input.planningWarningCount} advertencia(s).`,
      relatedStage: "commit",
      relatedRitual: "planning",
      actionHint: "open_planning",
      deepLinkPath: deepLinkPlanning(input.projectPublicId),
    })
  }

  if (input.missingBaseline) {
    push({
      alertId: "ALERT_MISSING_BASELINE",
      severity: "medium",
      category: "methodological",
      title: "Sin línea base",
      message: "El sprint activo no tiene línea base registrada.",
      relatedStage: "execute",
      relatedRitual: "planning",
      actionHint: null,
      deepLinkPath: deepLinkPlanning(input.projectPublicId),
    })
  }

  if (input.dailyPendingToday && input.dailyPendingThresholdReached) {
    push({
      alertId: "ALERT_DAILY_PENDING",
      severity: "medium",
      category: "temporal",
      title: "Daily pendiente hoy",
      message: "Aún no hay daily registrada para hoy.",
      relatedStage: "execute",
      relatedRitual: "dailyToday",
      actionHint: "open_daily",
      deepLinkPath: deepLinkDaily(input.projectPublicId),
    })
  }

  if (input.prepareStale) {
    push({
      alertId: "ALERT_PREPARE_STALE",
      severity: "medium",
      category: "temporal",
      title: "Mucho tiempo en preparación",
      message: "Llevas tiempo en preparación sin nuevo ciclo.",
      relatedStage: "prepare",
      relatedRitual: null,
      actionHint: "plan_next_cycle",
      deepLinkPath: deepLinkScrumSprints(input.projectPublicId),
    })
  }

  alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.sortOrder - b.sortOrder)
  return alerts.slice(0, MAX_ALERTS_IN_RESPONSE)
}
