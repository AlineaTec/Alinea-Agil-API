import type { MethodologyContext } from "../../team-operational-metrics/domain/team-operational-metrics.dto.js"

export type { MethodologyContext }

export type ReadinessLevel = "insufficient" | "limited" | "adequate"

export type VariationSignalLevel = "low" | "moderate" | "high" | "indeterminate"

export type StabilityBand = "more_stable" | "moderate_stability" | "less_stable" | "indeterminate"

export type PredictabilityPeriod = {
  kind: "last_n" | "custom"
  label: string
  from: string
  to: string
  lastN: number
}

export type ScrumPredictabilityNucleus = {
  averageCommitmentCompletionRateLastN: number | null
  /** Story points completados en cierre, media sobre sprints con snapshot v2. */
  averageVelocityLastN: number | null
  velocityVarianceLastN: number | null
  /** Media de (not completed / committed) en la ventana. */
  averageCarryOverRateLastN: number | null
  /** σ muestral de velocity en la ventana. */
  velocitySampleStdevLastN: number | null
}

export type KanbanPredictabilityNucleus = {
  /** Ítems completados a terminal por semana, media. */
  averageThroughputLastN: number | null
  throughputVarianceLastN: number | null
  sampleStdevLastN: number | null
}

export type VariationBlock = {
  base: "scrum_velocity" | "kanban_throughput" | "none"
  coefficientOfVariation: number | null
  rangeRatio: number | null
  variationSignalLevel: VariationSignalLevel
  stabilityBand: StabilityBand
}

export type TeamPredictabilitySummaryJson = {
  teamPublicId: string
  teamName: string
  teamStatus: string
  teamLeadUserPublicId: string | null
  linkedProjectsCount: number
  linkedProjectPublicIds: string[]
  methodologyContext: MethodologyContext
  lastN: number
  lastNUsed: number
  periodsUsedCount: number
  readiness: ReadinessLevel
  hasSufficientData: boolean
  period: PredictabilityPeriod
  scrum: ScrumPredictabilityNucleus | null
  kanban: KanbanPredictabilityNucleus | null
  variation: VariationBlock | null
  dataQualityWarnings: string[]
  calculationNotes: string[]
}

export type TrendPointScrum = {
  kind: "scrum_sprint"
  projectPublicId: string
  sprintPublicId: string
  label: string
  closedAt: string
  committedItemsCount: number
  completedItemsCount: number
  notCompletedItemsCount: number
  /** completed / committed; null if committed=0. */
  commitmentCompletionRate: number | null
  /** Story points en cierre (v2). */
  completedStoryPoints: number | null
  carryOverRate: number | null
  includedInPredictability: boolean
  pointWarnings: string[]
}

export type TrendPointKanban = {
  kind: "kanban_week"
  projectPublicId: string
  weekStart: string
  /** Throughput (ítems a Done) en la semana; suma multi-proyecto si aplica. */
  completedItemsCount: number
  includedInPredictability: boolean
  pointWarnings: string[]
}

export type TeamPredictabilityTrendJson = {
  teamPublicId: string
  teamName: string
  methodologyContext: MethodologyContext
  lastN: number
  periodsUsedCount: number
  period: PredictabilityPeriod
  scrumPoints: TrendPointScrum[]
  /** Si hay varios proyectos Kanban, puede ser agregado por `weekStart`. */
  kanbanPoints: TrendPointKanban[]
  dataQualityWarnings: string[]
  calculationNotes: string[]
}

export type ListTeamPredictabilityResultJson = {
  items: TeamPredictabilitySummaryJson[]
  totalCount: number
  limit: number
  offset: number
  methodologyContextWorkspace: MethodologyContext
  dataQualityWarnings: string[]
  calculationNotes: string[]
}
