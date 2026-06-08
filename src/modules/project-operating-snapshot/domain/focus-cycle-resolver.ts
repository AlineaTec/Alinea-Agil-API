import type { ScrumSprintState } from "../../project-scrum-sprint-planning/domain/scrum-sprint.js"
import type { ScrumSprintStatus } from "../../project-scrum-sprint-planning/domain/sprint-status.js"
import type { GuidedSprintPlanningSessionState } from "../../guided-sprint-planning/domain/guided-sprint-planning-session.js"
import { CLOSED_RECENT_DAYS } from "./wizard-stage.js"
import type { FocusCycleBlock, FocusCycleStatus } from "./operating-snapshot.dto.js"
import { formatYmdInZone } from "../../daily-alignment/domain/operational-calendar.js"

export type ResolvedFocusCycle = FocusCycleBlock & {
  sprint: ScrumSprintState | null
}

function sprintStatusToFocusStatus(status: ScrumSprintStatus): FocusCycleStatus {
  if (status === "active") return "active"
  if (status === "closed") return "closed"
  return "planning"
}

function formatDateOnly(d: Date | null): string | null {
  if (!d) return null
  return d.toISOString().slice(0, 10)
}

function daysBetweenYmd(fromYmd: string, toYmd: string): number {
  const from = Date.parse(`${fromYmd}T12:00:00.000Z`)
  const to = Date.parse(`${toYmd}T12:00:00.000Z`)
  return Math.round((to - from) / (24 * 60 * 60 * 1000))
}

function isClosedRecent(endDate: Date | null, todayYmd: string, timeZone: string): boolean {
  if (!endDate) return false
  const endYmd = formatYmdInZone(endDate, timeZone)
  return daysBetweenYmd(endYmd, todayYmd) <= CLOSED_RECENT_DAYS
}

function pickMostRecentPlanning(sprints: ScrumSprintState[]): ScrumSprintState | null {
  const planning = sprints.filter((s) => s.status === "planning" || s.status === "ready_for_execution")
  if (planning.length === 0) return null
  return [...planning].sort((a, b) => {
    const aStart = a.startDate?.getTime() ?? 0
    const bStart = b.startDate?.getTime() ?? 0
    if (aStart !== bStart) return bStart - aStart
    return b.updatedAt.getTime() - a.updatedAt.getTime()
  })[0]!
}

function pickMostRecentClosed(sprints: ScrumSprintState[]): ScrumSprintState | null {
  const closed = sprints.filter((s) => s.status === "closed")
  if (closed.length === 0) return null
  return [...closed].sort((a, b) => {
    const aEnd = a.endDate?.getTime() ?? a.updatedAt.getTime()
    const bEnd = b.endDate?.getTime() ?? b.updatedAt.getTime()
    return bEnd - aEnd
  })[0]!
}

function buildFromSprint(
  sprint: ScrumSprintState,
  resolutionReason: FocusCycleBlock["resolutionReason"],
  todayYmd: string,
  timeZone: string,
  planningSession: GuidedSprintPlanningSessionState | null,
): ResolvedFocusCycle {
  const status = sprintStatusToFocusStatus(sprint.status)
  const endYmd = sprint.endDate ? formatYmdInZone(sprint.endDate, timeZone) : null
  const isStale =
    status === "closed" && endYmd != null ? !isClosedRecent(sprint.endDate, todayYmd, timeZone) : null
  const daysRemaining =
    status === "active" && endYmd
      ? Math.max(0, daysBetweenYmd(todayYmd, endYmd))
      : status === "planning" && endYmd
        ? daysBetweenYmd(todayYmd, endYmd)
        : null

  return {
    kind: "scrum_sprint",
    publicId: sprint.sprintPublicId,
    displayName: sprint.name,
    status,
    startDate: formatDateOnly(sprint.startDate),
    endDate: endYmd,
    goalSummary: sprint.goal || null,
    hasBaseline: planningSession?.baselineCreated ?? false,
    baselinePublicId: planningSession?.baselinePublicId ?? null,
    daysRemaining,
    isStale,
    resolutionReason,
    sprint,
  }
}

export function resolveScrumFocusCycle(input: {
  sprints: ScrumSprintState[]
  todayYmd: string
  timeZone: string
  planningSessionBySprintId: Map<string, GuidedSprintPlanningSessionState | null>
}): ResolvedFocusCycle {
  const { sprints, todayYmd, timeZone, planningSessionBySprintId } = input

  const active = sprints.find((s) => s.status === "active")
  if (active) {
    return buildFromSprint(
      active,
      "active_sprint",
      todayYmd,
      timeZone,
      planningSessionBySprintId.get(active.sprintPublicId) ?? null,
    )
  }

  const planning = pickMostRecentPlanning(sprints)
  if (planning) {
    return buildFromSprint(
      planning,
      "latest_planning_sprint",
      todayYmd,
      timeZone,
      planningSessionBySprintId.get(planning.sprintPublicId) ?? null,
    )
  }

  const closed = pickMostRecentClosed(sprints)
  if (closed) {
    const recent = isClosedRecent(closed.endDate, todayYmd, timeZone)
    return buildFromSprint(
      closed,
      recent ? "recent_closed_sprint" : "recent_closed_sprint",
      todayYmd,
      timeZone,
      planningSessionBySprintId.get(closed.sprintPublicId) ?? null,
    )
  }

  return {
    kind: "none",
    publicId: null,
    displayName: null,
    status: "none",
    startDate: null,
    endDate: null,
    goalSummary: null,
    hasBaseline: false,
    baselinePublicId: null,
    daysRemaining: null,
    isStale: null,
    resolutionReason: "none_no_cycles",
    sprint: null,
  }
}

export function resolveKanbanFocusCycle(input: {
  openPlanningSession: GuidedSprintPlanningSessionState | null
  recentPlanningSession: GuidedSprintPlanningSessionState | null
}): ResolvedFocusCycle {
  const session = input.openPlanningSession ?? input.recentPlanningSession
  if (!session) {
    return {
      kind: "none",
      publicId: null,
      displayName: null,
      status: "none",
      startDate: null,
      endDate: null,
      goalSummary: null,
      hasBaseline: false,
      baselinePublicId: null,
      daysRemaining: null,
      isStale: null,
      resolutionReason: "none_no_cycles",
      sprint: null,
    }
  }

  const isOpen = session.status === "open"
  return {
    kind: "kanban_window",
    publicId: session.sessionPublicId,
    displayName: session.planningGoalDraft ?? "Ventana de compromiso",
    status: isOpen ? "planning" : session.baselineCreated ? "active" : "closed",
    startDate: session.sessionDate,
    endDate: null,
    goalSummary: session.sprintGoalFinal ?? session.planningGoalDraft,
    hasBaseline: session.baselineCreated,
    baselinePublicId: session.baselinePublicId,
    daysRemaining: null,
    isStale: null,
    resolutionReason: "kanban_planning_session",
    sprint: null,
  }
}

export function resolvePredictiveFocusCycle(): ResolvedFocusCycle {
  return {
    kind: "predictive_phase",
    publicId: null,
    displayName: "Fase activa",
    status: "active",
    startDate: null,
    endDate: null,
    goalSummary: null,
    hasBaseline: false,
    baselinePublicId: null,
    daysRemaining: null,
    isStale: null,
    resolutionReason: "predictive_active_phase",
    sprint: null,
  }
}

export function findClosedSprintsMissingReview(sprints: ScrumSprintState[]): ScrumSprintState[] {
  return sprints.filter((s) => {
    if (s.status !== "closed") return false
    return !s.review
  })
}
