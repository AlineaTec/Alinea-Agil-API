import type { WorkTeamState } from "../../workspace-work-teams/domain/work-team.js"
import type { MethodologyContext } from "../domain/team-operational-metrics.dto.js"
import type { TeamMemberOperationalRowJson, TeamOperationalMetricsSummaryJson } from "../domain/team-operational-metrics.dto.js"
import {
  type OperationalLoadLevel,
  OPERATIONAL_LOAD_NORMAL_MAX_ACTIVE_ITEMS,
  OPERATIONAL_LOAD_OVERLOAD_MIN_ACTIVE_ITEMS,
} from "../domain/team-operational-metrics.constants.js"

export type WorkItemAggregate = {
  totalAssigned: number
  totalUnassigned: number
  blocked: number
  totalActive: number
}

export type PerUserAggregate = {
  active: number
  inProgress: number
  blocked: number
  agingMsSum: number
  agingCount: number
}

type SummaryParams = {
  team: WorkTeamState
  activeMembersCount: number
  projectIds: string[]
  work: WorkItemAggregate
  methodology: MethodologyContext
  impedOpen: number
  impedCritical: number
}

export function toSummaryJson(p: SummaryParams): TeamOperationalMetricsSummaryJson {
  const capacityGap = p.team.targetSize != null ? p.team.targetSize - p.activeMembersCount : null
  const warnings: string[] = []
  if (p.projectIds.length === 0) warnings.push("no_linked_projects")
  if (p.team.teamLeadUserPublicId === null) warnings.push("team_has_no_lead")
  const t = p.work.totalActive
  if (t > 0 && p.work.totalUnassigned / t >= 0.3) {
    warnings.push("high_unassigned_ratio")
  }
  if (p.methodology === "mixed") {
    warnings.push("mixed_methodology: do not compare scrum and kanban velocity or throughput in one number")
  }
  const hasSufficientData = p.projectIds.length > 0
  return {
    teamPublicId: p.team.teamPublicId,
    teamName: p.team.name,
    teamStatus: p.team.status,
    teamLeadUserPublicId: p.team.teamLeadUserPublicId,
    activeMembersCount: p.activeMembersCount,
    targetSize: p.team.targetSize,
    capacityGap,
    linkedProjectsCount: p.projectIds.length,
    linkedProjectPublicIds: p.projectIds,
    assignedActiveWorkItemsCount: p.work.totalAssigned,
    unassignedWorkItemsCount: p.work.totalUnassigned,
    blockedWorkItemsCount: p.work.blocked,
    openImpedimentsCount: p.impedOpen,
    criticalOpenImpedimentsCount: p.impedCritical,
    hasSufficientData,
    dataQualityWarnings: warnings,
    methodologyContext: p.methodology,
    calculationNotes: [
      "Active work items: non-epic types with status open|in_progress across linked projects.",
      "Epics excluded from workload counts (v1).",
      "Blocked count uses Kanban isBlocked; always false in pure Scrum item rows (v1).",
    ],
  }
}

type MemberRowParams = {
  userPublicId: string
  fullName: string
  active: number
  inProgress: number
  blocked: number
  openImpediments: number
  averageAgingDays: number | null
  teamActiveTotal: number
  /** false cuando no hay proyectos vinculados o el alcance no permite métricas fiables por persona. */
  hasSufficientData?: boolean
}

function computeCurrentLoadLevel(active: number): OperationalLoadLevel {
  if (active <= 0) return "idle"
  if (active <= 2) return "low"
  if (active <= OPERATIONAL_LOAD_NORMAL_MAX_ACTIVE_ITEMS) return "normal"
  if (active < OPERATIONAL_LOAD_OVERLOAD_MIN_ACTIVE_ITEMS) return "high"
  return "very_high"
}

export function toMemberRowJson(p: MemberRowParams): TeamMemberOperationalRowJson {
  const currentLoadLevel = computeCurrentLoadLevel(p.active)
  const isIdle = p.active === 0
  const isOverloaded = p.active >= OPERATIONAL_LOAD_OVERLOAD_MIN_ACTIVE_ITEMS
  const share = p.teamActiveTotal > 0 ? p.active / p.teamActiveTotal : null
  return {
    userPublicId: p.userPublicId,
    fullName: p.fullName,
    activeAssignedWorkItemsCount: p.active,
    inProgressAssignedWorkItemsCount: p.inProgress,
    blockedAssignedWorkItemsCount: p.blocked,
    openImpedimentsOnAssignedItemsCount: p.openImpediments,
    averageAgingDaysOfAssignedWork: p.averageAgingDays,
    isIdle,
    isOverloaded,
    currentLoadLevel,
    hasSufficientData: p.hasSufficientData !== false,
    assignmentConcentrationShare: share,
  }
}

export function toListResultJson(p: {
  items: TeamOperationalMetricsSummaryJson[]
  totalCount: number
  limit: number
  offset: number
  methodologyContextWorkspace: MethodologyContext
  dataQualityWarnings: string[]
  calculationNotes: string[]
}) {
  return {
    items: p.items,
    totalCount: p.totalCount,
    limit: p.limit,
    offset: p.offset,
    methodologyContextWorkspace: p.methodologyContextWorkspace,
    dataQualityWarnings: p.dataQualityWarnings,
    calculationNotes: p.calculationNotes,
  }
}
