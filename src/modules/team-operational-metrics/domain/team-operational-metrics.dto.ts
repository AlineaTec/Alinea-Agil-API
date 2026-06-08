import type { OperationalLoadLevel } from "./team-operational-metrics.constants.js"

export type MethodologyContext = "scrum" | "kanban" | "mixed" | "other" | "unknown"

export type TeamOperationalMetricsSummaryJson = {
  teamPublicId: string
  teamName: string
  teamStatus: string
  teamLeadUserPublicId: string | null
  activeMembersCount: number
  targetSize: number | null
  capacityGap: number | null
  linkedProjectsCount: number
  linkedProjectPublicIds: string[]
  assignedActiveWorkItemsCount: number
  unassignedWorkItemsCount: number
  blockedWorkItemsCount: number
  openImpedimentsCount: number
  criticalOpenImpedimentsCount: number
  hasSufficientData: boolean
  dataQualityWarnings: string[]
  methodologyContext: MethodologyContext
  calculationNotes: string[]
}

export type TeamMemberOperationalRowJson = {
  userPublicId: string
  fullName: string
  activeAssignedWorkItemsCount: number
  inProgressAssignedWorkItemsCount: number
  blockedAssignedWorkItemsCount: number
  openImpedimentsOnAssignedItemsCount: number
  averageAgingDaysOfAssignedWork: number | null
  isIdle: boolean
  isOverloaded: boolean
  currentLoadLevel: OperationalLoadLevel
  hasSufficientData: boolean
  assignmentConcentrationShare: number | null
}

export type TeamOperationalListRowJson = TeamOperationalMetricsSummaryJson & {
  /** Copia del summary; sin ranking: orden por defecto por nombre o teamPublicId. */
  sortKey?: string
}

export type ListTeamsMetricsResultJson = {
  items: TeamOperationalListRowJson[]
  totalCount: number
  limit: number
  offset: number
  methodologyContextWorkspace: MethodologyContext
  dataQualityWarnings: string[]
  calculationNotes: string[]
}
