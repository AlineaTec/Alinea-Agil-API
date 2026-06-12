export type RoadmapWindowDto = {
  from: string
  to: string
}

export type RoadmapCountsSummaryDto = {
  totalItems: number
  completedItems: number
  inProgressItems: number
  blockedItems: number
}

export type RoadmapEpicSnapshotDto = {
  backlogItemPublicId: string
  itemType: string
  title: string
  status: string
  sortOrder: number
  priorityLevel: string
  parentItemPublicId: string | null
  createdAt: string
  updatedAt: string
  storyPoints: number | null
  isCarryover: boolean
  lastNotCompletedSprintPublicId: string | null
  lastNotCompletedSprintName: string | null
  lastNotCompletedClosedAt: string | null
}

export type RoadmapInitiativeDto = {
  epic: RoadmapEpicSnapshotDto
  status: "planned" | "in_progress" | "at_risk" | "completed"
  horizon: "now" | "next" | "later" | "completed"
  childProgress: { total: number; done: number; inProgress: number }
  connectedToCurrentCycle: boolean
  atRiskReason: string | null
}

export type RoadmapPanoramaDto = {
  active: number
  next: number
  completed: number
  noTargetDate: number
  atRisk: number
}

export type EpicScheduleEntryDto = {
  initiative: RoadmapInitiativeDto
  startYmd: string | null
  endYmd: string | null
  hasDatedRange: boolean
  scheduleSource: "sprint" | "lifecycle" | "sequential" | "none"
}

export type EpicGanttRowDto = {
  entry: EpicScheduleEntryDto
  label: string
  startPct: number
  widthPct: number
  variant: "accent" | "default"
}

export type RoadmapRiskDto = {
  epicPublicId: string
  epicTitle: string
  reason: string
}

export type RoadmapSummaryDto = {
  window: RoadmapWindowDto
  summary: RoadmapCountsSummaryDto
  panorama: RoadmapPanoramaDto
  initiatives: RoadmapInitiativeDto[]
  epicSchedule: EpicScheduleEntryDto[]
  epicGantt: {
    rows: EpicGanttRowDto[]
    hasDatedTimeline: boolean
    timelineStartYmd: string | null
    timelineEndYmd: string | null
  }
  risks: RoadmapRiskDto[]
  groups: Record<"now" | "next" | "later" | "completed", string[]>
}

export type RoadmapWorkItemRow = {
  backlogItemPublicId: string
  itemType: string
  title: string
  status: string
  sortOrder: number
  priorityLevel: string
  parentItemPublicId: string | null
  createdAt: Date
  updatedAt: Date
  isBlocked: boolean
  isCarryover: boolean
  lastNotCompletedSprintPublicId: string | null
  lastNotCompletedSprintName: string | null
  lastNotCompletedClosedAt: string | null
}
