import type { OperationalApproach } from "../../workspace-project-runtime/domain/operational-approach.js"
import type { GuidedSprintPlanningSessionState } from "../../guided-sprint-planning/domain/guided-sprint-planning-session.js"
import type { GuidedRefinementSessionState } from "../../guided-refinement/domain/guided-refinement-session.js"
import type { DailyAlignmentSessionState } from "../../daily-alignment/domain/daily-alignment-session.js"
import type { GuidedReviewSessionState } from "../../guided-review/domain/guided-review-session.js"
import type { GuidedRetrospectiveSessionState } from "../../guided-retrospective/domain/guided-retrospective-session.js"
import type { RitualStatusBlock, RitualStatusEntry } from "./operating-snapshot.dto.js"
import type { ResolvedFocusCycle } from "./focus-cycle-resolver.js"
import {
  deepLinkDaily,
  deepLinkRefinement,
  deepLinkPlanning,
  deepLinkReview,
  deepLinkRetro,
  deepLinkRetroActions,
} from "./deep-links.js"

function emptyEntry(applicability: RitualStatusEntry["applicability"]): RitualStatusEntry {
  return {
    applicability,
    state: applicability === "hidden" ? "not_applicable" : "not_started",
    sessionPublicId: null,
    sessionDate: null,
    linkedCyclePublicId: null,
    summaryHint: null,
    deepLinkPath: null,
  }
}

function sessionToEntry(
  session: { sessionPublicId: string; sessionDate: string; status: string } | null,
  applicability: RitualStatusEntry["applicability"],
  linkedCyclePublicId: string | null,
  deepLink: string,
  openStatuses: string[],
): RitualStatusEntry {
  if (applicability === "hidden") return emptyEntry("hidden")
  if (!session) {
    return { ...emptyEntry(applicability), deepLinkPath: deepLink }
  }
  const isOpen = openStatuses.includes(session.status)
  return {
    applicability,
    state: isOpen ? "in_progress" : "completed_recent",
    sessionPublicId: session.sessionPublicId,
    sessionDate: session.sessionDate,
    linkedCyclePublicId,
    summaryHint: isOpen ? "Sesión en progreso" : "Sesión cerrada recientemente",
    deepLinkPath: deepLink,
  }
}

export function buildRitualStatus(input: {
  approach: OperationalApproach
  projectPublicId: string
  focusCycle: ResolvedFocusCycle
  refinementSession: GuidedRefinementSessionState | null
  planningSession: GuidedSprintPlanningSessionState | null
  dailyToday: DailyAlignmentSessionState | null
  reviewSession: GuidedReviewSessionState | null
  retroSession: GuidedRetrospectiveSessionState | null
  openRetroActionCount: number
  overdueRetroActionCount: number
}): RitualStatusBlock {
  const { approach, projectPublicId, focusCycle } = input
  const cycleId = focusCycle.publicId

  const refinementApp =
    approach === "predictive_phases" ? "hidden" : approach === "kanban" ? "optional" : "optional"
  const planningApp =
    approach === "predictive_phases"
      ? "hidden"
      : approach === "kanban"
        ? focusCycle.kind === "kanban_window"
          ? "required"
          : "optional"
        : "required"
  const dailyApp =
    approach === "predictive_phases" ? "hidden" : approach === "kanban" ? "optional" : "required"
  const reviewApp = approach === "predictive_phases" ? "hidden" : "required"
  const retroApp = approach === "predictive_phases" ? "hidden" : "required"

  const dailyState: RitualStatusEntry = (() => {
    const base = sessionToEntry(
      input.dailyToday,
      dailyApp,
      cycleId,
      deepLinkDaily(projectPublicId),
      ["open"],
    )
    if (dailyApp !== "hidden" && !input.dailyToday) {
      return {
        ...base,
        state: "not_started",
        summaryHint: "Daily pendiente hoy",
      }
    }
    if (input.dailyToday?.status === "closed") {
      return { ...base, state: "completed_recent", summaryHint: "Daily cerrada hoy" }
    }
    return base
  })()

  const retroActions: RitualStatusEntry = {
    applicability: retroApp === "hidden" ? "hidden" : "optional",
    state:
      input.overdueRetroActionCount > 0
        ? "overdue"
        : input.openRetroActionCount > 0
          ? "in_progress"
          : "not_applicable",
    sessionPublicId: null,
    sessionDate: null,
    linkedCyclePublicId: cycleId,
    summaryHint:
      input.overdueRetroActionCount > 0
        ? `${input.overdueRetroActionCount} acción(es) vencida(s)`
        : input.openRetroActionCount > 0
          ? `${input.openRetroActionCount} acción(es) abierta(s)`
          : null,
    deepLinkPath: deepLinkRetroActions(projectPublicId),
  }

  return {
    refinement: sessionToEntry(
      input.refinementSession,
      refinementApp,
      cycleId,
      deepLinkRefinement(projectPublicId),
      ["open"],
    ),
    planning: sessionToEntry(
      input.planningSession,
      planningApp,
      cycleId,
      deepLinkPlanning(projectPublicId),
      ["open"],
    ),
    dailyToday: dailyState,
    review: sessionToEntry(
      input.reviewSession,
      reviewApp,
      cycleId,
      deepLinkReview(projectPublicId),
      ["open"],
    ),
    retro: sessionToEntry(
      input.retroSession,
      retroApp,
      cycleId,
      deepLinkRetro(projectPublicId),
      ["open", "collecting", "voting", "closing", "planned"],
    ),
    retroActions,
  }
}
