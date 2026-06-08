import type { OperatingAlert, NextBestActionBlock, NbaType, ViewerRole } from "./operating-snapshot.dto.js"
import type { WizardStage } from "./wizard-stage.js"
import type { ResolvedFocusCycle } from "./focus-cycle-resolver.js"
import type { OperationalApproach } from "../../workspace-project-runtime/domain/operational-approach.js"
import {
  deepLinkDaily,
  deepLinkPlanning,
  deepLinkReview,
  deepLinkRetro,
  deepLinkRetroActions,
  deepLinkScrumSprints,
  deepLinkScrumBoard,
  deepLinkKanbanBoard,
  deepLinkBacklog,
  deepLinkRefinement,
  deepLinkImpediments,
  deepLinkInsights,
} from "./deep-links.js"

export type NbaBuildInput = {
  projectPublicId: string
  approach: OperationalApproach
  wizardStage: WizardStage
  focusCycle: ResolvedFocusCycle
  alerts: OperatingAlert[]
  viewerRole: ViewerRole
  archived: boolean
  setupIncomplete: boolean
  planningSessionOpen: boolean
  planningSessionClosed: boolean
  sprintStuckInPlanning: boolean
  dailyPendingToday: boolean
  reviewPendingForFocus: boolean
  retroPendingForFocus: boolean
  overdueRetroActionCount: number
  ceremonialCompleteForStaleClosed: boolean
  snoozeKeys: Set<string>
  todayYmd: string
}

function makeNba(
  partial: Omit<NextBestActionBlock, "dismissible" | "suppressedBySnooze" | "fallbackAction"> & {
    fallbackAction?: NextBestActionBlock["fallbackAction"]
  },
  snoozeKeys: Set<string>,
): NextBestActionBlock {
  return {
    ...partial,
    dismissible: true,
    suppressedBySnooze: snoozeKeys.has(partial.dismissSnoozeKey),
    fallbackAction: partial.fallbackAction ?? null,
  }
}

function snoozeKey(actionId: string, todayYmd: string): string {
  return `snooze:${actionId}:${todayYmd}`
}

export function buildNextBestAction(input: NbaBuildInput): NextBestActionBlock | null {
  if (input.archived) return null

  const { projectPublicId, approach, snoozeKeys, todayYmd } = input

  const critical = input.alerts.find((a) => a.severity === "critical")
  if (critical) {
    return makeNba(
      {
        actionId: "NBA_ADDRESS_CRITICAL",
        type: "address_critical_alert",
        title: critical.title,
        reason: critical.message,
        urgency: "critical",
        primaryDeepLink: critical.deepLinkPath ?? deepLinkImpediments(projectPublicId),
        secondaryDeepLink: null,
        dismissSnoozeKey: snoozeKey("NBA_ADDRESS_CRITICAL", todayYmd),
      },
      snoozeKeys,
    )
  }

  if (input.setupIncomplete) {
    return makeNba(
      {
        actionId: "NBA_COMPLETE_SETUP",
        type: "complete_setup",
        title: "Completar configuración",
        reason: "El proyecto aún no está listo para operar con fluidez.",
        urgency: "high",
        primaryDeepLink: deepLinkScrumSprints(projectPublicId),
        secondaryDeepLink: null,
        dismissSnoozeKey: snoozeKey("NBA_COMPLETE_SETUP", todayYmd),
      },
      snoozeKeys,
    )
  }

  if (approach === "scrum" && input.focusCycle.kind === "none") {
    return makeNba(
      {
        actionId: "NBA_OPEN_PLANNING",
        type: "open_planning",
        title: "Abrir planificación de sprint",
        reason: "No hay ciclo focal; crea o abre la planning.",
        urgency: "high",
        primaryDeepLink: deepLinkScrumSprints(projectPublicId),
        secondaryDeepLink: deepLinkPlanning(projectPublicId),
        dismissSnoozeKey: snoozeKey("NBA_OPEN_PLANNING", todayYmd),
      },
      snoozeKeys,
    )
  }

  if (input.focusCycle.status === "planning" || input.planningSessionOpen) {
    if (input.sprintStuckInPlanning) {
      return makeNba(
        {
          actionId: "NBA_START_SPRINT",
          type: "start_sprint",
          title: "Iniciar sprint",
          reason: "La planning está cerrada; inicia el sprint para ejecutar.",
          urgency: "high",
          primaryDeepLink: deepLinkScrumSprints(projectPublicId),
          secondaryDeepLink: null,
          dismissSnoozeKey: snoozeKey("NBA_START_SPRINT", todayYmd),
        },
        snoozeKeys,
      )
    }
    return makeNba(
      {
        actionId: "NBA_OPEN_PLANNING",
        type: "open_planning",
        title: "Continuar planning",
        reason: "Hay un ciclo en compromiso pendiente de cerrar o iniciar.",
        urgency: "high",
        primaryDeepLink: deepLinkPlanning(projectPublicId),
        secondaryDeepLink: deepLinkScrumSprints(projectPublicId),
        dismissSnoozeKey: snoozeKey("NBA_OPEN_PLANNING", todayYmd),
      },
      snoozeKeys,
    )
  }

  if (input.wizardStage === "prepare") {
    if (input.viewerRole === "product_owner") {
      return makeNba(
        {
          actionId: "NBA_PREPARE_BACKLOG",
          type: "prepare_backlog",
          title: "Preparar backlog",
          reason: "Prioriza candidatos antes del próximo compromiso.",
          urgency: "normal",
          primaryDeepLink: deepLinkBacklog(projectPublicId, approach === "kanban" ? "kanban" : "scrum"),
          secondaryDeepLink: deepLinkRefinement(projectPublicId),
          dismissSnoozeKey: snoozeKey("NBA_PREPARE_BACKLOG", todayYmd),
        },
        snoozeKeys,
      )
    }
    return makeNba(
      {
        actionId: "NBA_CONTINUE_REFINEMENT",
        type: "continue_refinement",
        title: "Continuar refinement",
        reason: "Prepara ítems listos para planning.",
        urgency: "normal",
        primaryDeepLink: deepLinkRefinement(projectPublicId),
        secondaryDeepLink: null,
        dismissSnoozeKey: snoozeKey("NBA_CONTINUE_REFINEMENT", todayYmd),
      },
      snoozeKeys,
    )
  }

  if (input.wizardStage === "execute") {
    if (input.dailyPendingToday && input.viewerRole !== "product_owner" && input.viewerRole !== "leader") {
      return makeNba(
        {
          actionId: "NBA_OPEN_DAILY_TODAY",
          type: "open_daily",
          title: "Abrir daily de hoy",
          reason: "Aún no hay sesión daily cerrada para hoy.",
          urgency: "normal",
          primaryDeepLink: deepLinkDaily(projectPublicId),
          secondaryDeepLink:
            approach === "scrum" && input.focusCycle.publicId
              ? deepLinkScrumBoard(projectPublicId, input.focusCycle.publicId)
              : deepLinkKanbanBoard(projectPublicId),
          dismissSnoozeKey: snoozeKey("NBA_OPEN_DAILY_TODAY", todayYmd),
          fallbackAction: {
            actionId: "NBA_OPEN_BOARD",
            type: "open_board",
            title: "Abrir tablero",
            primaryDeepLink:
              approach === "scrum" && input.focusCycle.publicId
                ? deepLinkScrumBoard(projectPublicId, input.focusCycle.publicId)
                : deepLinkKanbanBoard(projectPublicId),
          },
        },
        snoozeKeys,
      )
    }

    if (input.viewerRole === "developer") {
      return makeNba(
        {
          actionId: "NBA_OPEN_BOARD",
          type: "open_board",
          title: "Abrir tablero",
          reason: "Continúa la ejecución del ciclo activo.",
          urgency: "normal",
          primaryDeepLink:
            approach === "scrum" && input.focusCycle.publicId
              ? deepLinkScrumBoard(projectPublicId, input.focusCycle.publicId)
              : deepLinkKanbanBoard(projectPublicId),
          secondaryDeepLink: deepLinkDaily(projectPublicId),
          dismissSnoozeKey: snoozeKey("NBA_OPEN_BOARD", todayYmd),
        },
        snoozeKeys,
      )
    }
  }

  if (input.wizardStage === "close" || input.reviewPendingForFocus) {
    return makeNba(
      {
        actionId: "NBA_CLOSE_REVIEW",
        type: "close_review",
        title: "Realizar review",
        reason: "El incremento del ciclo necesita inspección.",
        urgency: "high",
        primaryDeepLink: deepLinkReview(projectPublicId),
        secondaryDeepLink: null,
        dismissSnoozeKey: snoozeKey("NBA_CLOSE_REVIEW", todayYmd),
      },
      snoozeKeys,
    )
  }

  if (input.wizardStage === "improve" || input.retroPendingForFocus) {
    if (input.overdueRetroActionCount > 0) {
      return makeNba(
        {
          actionId: "NBA_REVIEW_OVERDUE_ACTIONS",
          type: "review_overdue_actions",
          title: "Revisar acciones vencidas",
          reason: "Hay acciones de mejora vencidas.",
          urgency: "high",
          primaryDeepLink: deepLinkRetroActions(projectPublicId),
          secondaryDeepLink: deepLinkRetro(projectPublicId),
          dismissSnoozeKey: snoozeKey("NBA_REVIEW_OVERDUE_ACTIONS", todayYmd),
        },
        snoozeKeys,
      )
    }
    return makeNba(
      {
        actionId: "NBA_OPEN_RETRO",
        type: "open_retro",
        title: "Abrir retrospectiva",
        reason: "Cierra el ciclo con mejora del proceso.",
        urgency: "high",
        primaryDeepLink: deepLinkRetro(projectPublicId),
        secondaryDeepLink: null,
        dismissSnoozeKey: snoozeKey("NBA_OPEN_RETRO", todayYmd),
      },
      snoozeKeys,
    )
  }

  if (input.focusCycle.isStale && input.ceremonialCompleteForStaleClosed) {
    return makeNba(
      {
        actionId: "NBA_PLAN_NEXT_CYCLE",
        type: "plan_next_cycle",
        title: "Preparar siguiente ciclo",
        reason: "El ciclo anterior está cerrado; planifica el siguiente.",
        urgency: "normal",
        primaryDeepLink: deepLinkScrumSprints(projectPublicId),
        secondaryDeepLink: deepLinkPlanning(projectPublicId),
        dismissSnoozeKey: snoozeKey("NBA_PLAN_NEXT_CYCLE", todayYmd),
      },
      snoozeKeys,
    )
  }

  if (input.viewerRole === "leader") {
    return makeNba(
      {
        actionId: "NBA_VIEW_INSIGHTS",
        type: "view_insights",
        title: "Ver insights del proyecto",
        reason: "Consulta señales e informes del periodo.",
        urgency: "low",
        primaryDeepLink: deepLinkInsights(projectPublicId),
        secondaryDeepLink: null,
        dismissSnoozeKey: snoozeKey("NBA_VIEW_INSIGHTS", todayYmd),
      },
      snoozeKeys,
    )
  }

  return makeNba(
    {
      actionId: "NBA_PLAN_NEXT_CYCLE",
      type: "plan_next_cycle",
      title: "Preparar siguiente ciclo",
      reason: "Avanza hacia el próximo incremento.",
      urgency: "normal",
      primaryDeepLink: deepLinkScrumSprints(projectPublicId),
      secondaryDeepLink: deepLinkBacklog(projectPublicId, approach === "kanban" ? "kanban" : "scrum"),
      dismissSnoozeKey: snoozeKey("NBA_PLAN_NEXT_CYCLE", todayYmd),
    },
    snoozeKeys,
  )
}

export function applySnoozeToNba(
  nba: NextBestActionBlock | null,
  snoozeKeys: Set<string>,
): NextBestActionBlock | null {
  if (!nba) return null
  if (!snoozeKeys.has(nba.dismissSnoozeKey)) return nba
  if (nba.fallbackAction) {
    return {
      ...nba,
      suppressedBySnooze: true,
      actionId: nba.fallbackAction.actionId,
      type: nba.fallbackAction.type as NbaType,
      title: nba.fallbackAction.title,
      primaryDeepLink: nba.fallbackAction.primaryDeepLink,
      reason: "Acción principal omitida por hoy.",
      urgency: "low",
    }
  }
  return { ...nba, suppressedBySnooze: true }
}
