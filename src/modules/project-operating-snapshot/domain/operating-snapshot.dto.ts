import type { OperationalApproach } from "../../workspace-project-runtime/domain/operational-approach.js"
import type { WizardStage } from "./wizard-stage.js"

export type ProjectLifecycleStatus = "ready" | "ready_partial" | "archived"

export type ViewerAccessLevel = "full" | "operational" | "read_only" | "stakeholder"

export type FocusCycleKind = "scrum_sprint" | "kanban_window" | "predictive_phase" | "none"

export type FocusCycleStatus = "planning" | "active" | "closed" | "none"

export type FocusCycleResolutionReason =
  | "active_sprint"
  | "latest_planning_sprint"
  | "recent_closed_sprint"
  | "kanban_planning_session"
  | "predictive_active_phase"
  | "none_no_cycles"
  | "archived_frozen"

export type RitualApplicability = "required" | "optional" | "hidden"

export type RitualState =
  | "not_started"
  | "in_progress"
  | "completed_recent"
  | "overdue"
  | "not_applicable"
  | "unknown"

export type AlertSeverity = "critical" | "high" | "medium" | "info"

export type AlertCategory = "operational" | "ceremonial" | "temporal" | "setup" | "methodological"

export type NbaUrgency = "critical" | "high" | "normal" | "low"

export type NbaType =
  | "complete_setup"
  | "prepare_backlog"
  | "continue_refinement"
  | "open_planning"
  | "start_sprint"
  | "open_board"
  | "open_daily"
  | "address_critical_alert"
  | "close_review"
  | "open_retro"
  | "review_overdue_actions"
  | "plan_next_cycle"
  | "view_insights"
  | "view_roadmap"

export type ViewerRole =
  | "product_owner"
  | "scrum_master"
  | "developer"
  | "leader"
  | "stakeholder"
  | "mixed"

export type HubLayoutVariant = "full" | "operational" | "executive" | "stakeholder_readonly"

export type ProjectContextBlock = {
  workspacePublicId: string
  projectPublicId: string
  projectName: string
  operationalApproach: OperationalApproach
  operationalTimeZone: string
  projectLifecycleStatus: ProjectLifecycleStatus
  viewerAccessLevel: ViewerAccessLevel
}

export type WizardStateBlock = {
  stage: WizardStage
  stageLabel: string
  stageSummary: string
  previousStage: WizardStage | null
  nextStage: WizardStage | null
  derivationVersion: string
}

export type FocusCycleBlock = {
  kind: FocusCycleKind
  publicId: string | null
  displayName: string | null
  status: FocusCycleStatus
  startDate: string | null
  endDate: string | null
  goalSummary: string | null
  hasBaseline: boolean
  baselinePublicId: string | null
  daysRemaining: number | null
  isStale: boolean | null
  resolutionReason: FocusCycleResolutionReason
}

export type RitualStatusEntry = {
  applicability: RitualApplicability
  state: RitualState
  sessionPublicId: string | null
  sessionDate: string | null
  linkedCyclePublicId: string | null
  summaryHint: string | null
  deepLinkPath: string | null
}

export type RitualStatusBlock = {
  refinement: RitualStatusEntry
  planning: RitualStatusEntry
  dailyToday: RitualStatusEntry
  review: RitualStatusEntry
  retro: RitualStatusEntry
  retroActions: RitualStatusEntry
}

export type OperatingAlert = {
  alertId: string
  severity: AlertSeverity
  category: AlertCategory
  title: string
  message: string
  relatedStage: WizardStage | null
  relatedRitual: string | null
  actionHint: string | null
  deepLinkPath: string | null
  sortOrder: number
}

export type NextBestActionBlock = {
  actionId: string
  type: NbaType
  title: string
  reason: string
  urgency: NbaUrgency
  primaryDeepLink: string
  secondaryDeepLink: string | null
  dismissible: boolean
  dismissSnoozeKey: string
  suppressedBySnooze: boolean
  fallbackAction: Pick<NextBestActionBlock, "actionId" | "type" | "title" | "primaryDeepLink"> | null
}

export type RhythmSummary = {
  metricKey: string
  label: string
  valueDisplay: string
  trend: "up" | "down" | "flat" | "unknown"
  deepLinkPath: string
}

export type CalendarExtractEvent = {
  eventId: string
  kind: string
  title: string
  startAt: string
  endAt: string | null
  severity: AlertSeverity | null
  deepLinkPath: string | null
}

export type CalendarExtract = {
  timeZone: string
  events: CalendarExtractEvent[]
  hasMore: boolean
}

export type SignalsBlock = {
  criticalImpedimentCount: number
  openImpedimentCount: number
  backlogReadyForPlanningCount: number | null
  committedItemCount: number | null
  overdueRetroActionCount: number
  openRetroActionCount: number
  planningWarningCount: number | null
  hasActiveSprint: boolean | null
  sprintCount: number | null
  rhythmSummary: RhythmSummary | null
  calendarExtract: CalendarExtract | null
}

export type RoleProjectionBlock = {
  viewerRole: ViewerRole
  emphasizedBlocks: string[]
  hiddenAlertCategories: AlertCategory[]
  nbaPriorityOverride: string | null
  hubLayoutVariant: HubLayoutVariant
}

export type RefreshMetaBlock = {
  generatedAt: string
  expiresAt: string
  ttlSeconds: number
  cacheKey: string | null
  partial: boolean
  partialSources: string[]
  derivationVersion: string
}

export type ProjectOperatingSnapshot = {
  projectContext: ProjectContextBlock
  wizardState: WizardStateBlock
  focusCycle: FocusCycleBlock
  ritualStatus: RitualStatusBlock
  alerts: OperatingAlert[]
  nextBestAction: NextBestActionBlock | null
  signals: SignalsBlock
  roleProjection: RoleProjectionBlock
  refreshMeta: RefreshMetaBlock
}
