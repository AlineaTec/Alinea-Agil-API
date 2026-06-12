import type { ScrumSprintState } from "../../project-scrum-sprint-planning/domain/scrum-sprint.js"
import type {
  EpicGanttRowDto,
  EpicScheduleEntryDto,
  RoadmapEpicSnapshotDto,
  RoadmapInitiativeDto,
  RoadmapPanoramaDto,
  RoadmapRiskDto,
  RoadmapSummaryDto,
  RoadmapWindowDto,
  RoadmapWorkItemRow,
} from "../domain/roadmap-summary.types.js"

const HORIZON_ORDER = ["now", "next", "later", "completed"] as const

function ymdFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(iso)
  return match?.[1] ?? null
}

function msFromYmd(ymd: string): number {
  return Date.parse(`${ymd}T12:00:00`)
}

function formatYmdLocal(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(msFromYmd(ymd))
  d.setDate(d.getDate() + days)
  return formatYmdLocal(d)
}

function descendantsOf(epicId: string, items: RoadmapWorkItemRow[]): RoadmapWorkItemRow[] {
  const childrenByParent = new Map<string, RoadmapWorkItemRow[]>()
  for (const it of items) {
    const p = it.parentItemPublicId
    if (!p) continue
    const list = childrenByParent.get(p) ?? []
    list.push(it)
    childrenByParent.set(p, list)
  }
  const out: RoadmapWorkItemRow[] = []
  const queue = [...(childrenByParent.get(epicId) ?? [])]
  while (queue.length > 0) {
    const cur = queue.shift()!
    out.push(cur)
    queue.push(...(childrenByParent.get(cur.backlogItemPublicId) ?? []))
  }
  return out
}

function workDescendants(epicId: string, items: RoadmapWorkItemRow[]): RoadmapWorkItemRow[] {
  return descendantsOf(epicId, items).filter((i) => i.itemType !== "epic")
}

function epicWorkDescendantIds(epicId: string, items: RoadmapWorkItemRow[]): string[] {
  return workDescendants(epicId, items).map((d) => d.backlogItemPublicId)
}

function toEpicSnapshot(epic: RoadmapWorkItemRow): RoadmapEpicSnapshotDto {
  return {
    backlogItemPublicId: epic.backlogItemPublicId,
    itemType: epic.itemType,
    title: epic.title,
    status: epic.status,
    sortOrder: epic.sortOrder,
    priorityLevel: epic.priorityLevel,
    parentItemPublicId: epic.parentItemPublicId,
    createdAt: epic.createdAt.toISOString(),
    updatedAt: epic.updatedAt.toISOString(),
    storyPoints: null,
    isCarryover: epic.isCarryover,
    lastNotCompletedSprintPublicId: epic.lastNotCompletedSprintPublicId,
    lastNotCompletedSprintName: epic.lastNotCompletedSprintName,
    lastNotCompletedClosedAt: epic.lastNotCompletedClosedAt,
  }
}

function resolveStatus(
  epic: RoadmapWorkItemRow,
  descendants: RoadmapWorkItemRow[],
): { status: RoadmapInitiativeDto["status"]; atRiskReason: string | null } {
  if (epic.status === "done") return { status: "completed", atRiskReason: null }
  const hasCarryover = epic.isCarryover || descendants.some((d) => d.isCarryover)
  if (hasCarryover) return { status: "at_risk", atRiskReason: "carryover" }
  if (epic.priorityLevel === "urgent" && epic.status === "in_progress") {
    return { status: "at_risk", atRiskReason: "urgent" }
  }
  if (epic.status === "in_progress") return { status: "in_progress", atRiskReason: null }
  return { status: "planned", atRiskReason: null }
}

function resolveHorizon(
  status: RoadmapInitiativeDto["status"],
  epic: RoadmapWorkItemRow,
): RoadmapInitiativeDto["horizon"] {
  if (status === "completed") return "completed"
  if (status === "in_progress" || status === "at_risk") return "now"
  if (epic.priorityLevel === "high" || epic.priorityLevel === "urgent") return "next"
  return "later"
}

function isConnectedToCycle(
  epic: RoadmapWorkItemRow,
  descendants: RoadmapWorkItemRow[],
  committedBacklogIds: Set<string>,
  cycleActive: boolean,
): boolean {
  if (committedBacklogIds.has(epic.backlogItemPublicId)) return true
  if (descendants.some((d) => committedBacklogIds.has(d.backlogItemPublicId))) return true
  if (cycleActive && (epic.status === "in_progress" || epic.status === "open")) return true
  return false
}

function buildInitiatives(
  items: RoadmapWorkItemRow[],
  committedBacklogIds: Set<string>,
  cycleActive: boolean,
): RoadmapInitiativeDto[] {
  const epics = items.filter((i) => i.itemType === "epic").sort((a, b) => a.sortOrder - b.sortOrder)
  return epics.map((epic) => {
    const descendants = workDescendants(epic.backlogItemPublicId, items)
    const { status, atRiskReason } = resolveStatus(epic, descendants)
    const horizon = resolveHorizon(status, epic)
    const done = descendants.filter((d) => d.status === "done").length
    const inProgress = descendants.filter((d) => d.status === "in_progress").length
    return {
      epic: toEpicSnapshot(epic),
      status,
      horizon,
      childProgress: { total: descendants.length, done, inProgress },
      connectedToCurrentCycle: isConnectedToCycle(epic, descendants, committedBacklogIds, cycleActive),
      atRiskReason,
    }
  })
}

function buildPanorama(initiatives: RoadmapInitiativeDto[]): RoadmapPanoramaDto {
  let active = 0
  let next = 0
  let completed = 0
  let atRisk = 0
  for (const i of initiatives) {
    if (i.status === "completed") completed++
    else if (i.horizon === "now") active++
    else if (i.horizon === "next") next++
    if (i.status === "at_risk") atRisk++
  }
  return {
    active,
    next,
    completed,
    noTargetDate: initiatives.length,
    atRisk,
  }
}

function compareInitiatives(a: RoadmapInitiativeDto, b: RoadmapInitiativeDto): number {
  const ha = HORIZON_ORDER.indexOf(a.horizon)
  const hb = HORIZON_ORDER.indexOf(b.horizon)
  if (ha !== hb) return ha - hb
  return a.epic.sortOrder - b.epic.sortOrder
}

function sprintRangeForItemIds(
  itemIds: string[],
  itemCommittedSprintIds: Map<string, string[]>,
  sprintsById: Map<string, ScrumSprintState>,
): { startYmd: string; endYmd: string } | null {
  let minMs: number | null = null
  let maxMs: number | null = null
  for (const itemId of itemIds) {
    const sprintIds = itemCommittedSprintIds.get(itemId) ?? []
    for (const sprintId of sprintIds) {
      const sprint = sprintsById.get(sprintId)
      if (!sprint?.startDate || !sprint.endDate) continue
      const startYmd = formatYmdLocal(sprint.startDate)
      const endYmd = formatYmdLocal(sprint.endDate)
      const startMs = msFromYmd(startYmd)
      const endMs = msFromYmd(endYmd)
      if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) continue
      minMs = minMs === null ? startMs : Math.min(minMs, startMs)
      maxMs = maxMs === null ? endMs : Math.max(maxMs, endMs)
    }
  }
  if (minMs === null || maxMs === null) return null
  return { startYmd: formatYmdLocal(new Date(minMs)), endYmd: formatYmdLocal(new Date(maxMs)) }
}

function lifecycleRange(epic: RoadmapEpicSnapshotDto): { startYmd: string; endYmd: string } | null {
  const startYmd = ymdFromIso(epic.createdAt)
  const endYmd = ymdFromIso(epic.updatedAt)
  if (!startYmd || !endYmd) return null
  if (msFromYmd(endYmd) < msFromYmd(startYmd)) return null
  return { startYmd, endYmd }
}

function projectSequentialWindow(initiatives: RoadmapInitiativeDto[]): { startYmd: string; endYmd: string } {
  const created = initiatives
    .map((i) => ymdFromIso(i.epic.createdAt))
    .filter((d): d is string => d != null)
  const updated = initiatives
    .map((i) => ymdFromIso(i.epic.updatedAt))
    .filter((d): d is string => d != null)
  const today = formatYmdLocal(new Date())
  const startYmd = created.length > 0 ? created.sort()[0]! : today
  let endYmd = updated.length > 0 ? updated.sort().at(-1)! : addDaysYmd(startYmd, 90)
  if (msFromYmd(endYmd) <= msFromYmd(startYmd)) {
    endYmd = addDaysYmd(startYmd, Math.max(30, initiatives.length * 14))
  } else {
    endYmd = addDaysYmd(endYmd, 7)
  }
  return { startYmd, endYmd }
}

function buildEpicSchedule(input: {
  initiatives: RoadmapInitiativeDto[]
  items: RoadmapWorkItemRow[]
  sprintsById: Map<string, ScrumSprintState>
  itemCommittedSprintIds: Map<string, string[]>
}): EpicScheduleEntryDto[] {
  const ordered = [...input.initiatives].sort(compareInitiatives)
  const sequentialSlots: { startYmd: string; endYmd: string }[] = []
  const needsSequential = ordered.some((initiative) => {
    const itemIds = [
      initiative.epic.backlogItemPublicId,
      ...epicWorkDescendantIds(initiative.epic.backlogItemPublicId, input.items),
    ]
    if (sprintRangeForItemIds(itemIds, input.itemCommittedSprintIds, input.sprintsById)) return false
    if (initiative.status === "completed" && lifecycleRange(initiative.epic)) return false
    return true
  })
  if (needsSequential && ordered.length > 0) {
    const window = projectSequentialWindow(ordered)
    const spanMs = Math.max(1, msFromYmd(window.endYmd) - msFromYmd(window.startYmd))
    const slotMs = Math.max(7 * 86400000, Math.floor(spanMs / Math.max(ordered.length, 1)))
    ordered.forEach((_, idx) => {
      const slotStart = msFromYmd(window.startYmd) + idx * slotMs
      const slotEnd = Math.min(msFromYmd(window.endYmd), slotStart + slotMs - 86400000)
      sequentialSlots[idx] = {
        startYmd: formatYmdLocal(new Date(slotStart)),
        endYmd: formatYmdLocal(new Date(Math.max(slotStart, slotEnd))),
      }
    })
  }
  return ordered.map((initiative, idx) => {
    const itemIds = [
      initiative.epic.backlogItemPublicId,
      ...epicWorkDescendantIds(initiative.epic.backlogItemPublicId, input.items),
    ]
    const sprintRange = sprintRangeForItemIds(itemIds, input.itemCommittedSprintIds, input.sprintsById)
    if (sprintRange) {
      return {
        initiative,
        startYmd: sprintRange.startYmd,
        endYmd: sprintRange.endYmd,
        hasDatedRange: true,
        scheduleSource: "sprint",
      }
    }
    if (initiative.status === "completed") {
      const life = lifecycleRange(initiative.epic)
      if (life) {
        return {
          initiative,
          startYmd: life.startYmd,
          endYmd: life.endYmd,
          hasDatedRange: true,
          scheduleSource: "lifecycle",
        }
      }
    }
    const slot = sequentialSlots[idx]
    if (slot) {
      return {
        initiative,
        startYmd: slot.startYmd,
        endYmd: slot.endYmd,
        hasDatedRange: true,
        scheduleSource: "sequential",
      }
    }
    return {
      initiative,
      startYmd: null,
      endYmd: null,
      hasDatedRange: false,
      scheduleSource: "none",
    }
  })
}

function buildEpicGantt(entries: EpicScheduleEntryDto[]): RoadmapSummaryDto["epicGantt"] {
  const dated = entries.filter((e) => e.startYmd && e.endYmd)
  if (dated.length === 0) {
    return { rows: [], hasDatedTimeline: false, timelineStartYmd: null, timelineEndYmd: null }
  }
  let minMs: number | null = null
  let maxMs: number | null = null
  for (const entry of dated) {
    const startMs = msFromYmd(entry.startYmd!)
    const endMs = msFromYmd(entry.endYmd!)
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) continue
    minMs = minMs === null ? startMs : Math.min(minMs, startMs)
    maxMs = maxMs === null ? endMs : Math.max(maxMs, endMs)
  }
  if (minMs === null || maxMs === null || maxMs <= minMs) {
    return { rows: [], hasDatedTimeline: false, timelineStartYmd: null, timelineEndYmd: null }
  }
  const span = Math.max(1, maxMs - minMs)
  const hasRealDates = entries.some((e) => e.scheduleSource === "sprint" || e.scheduleSource === "lifecycle")
  const rows: EpicGanttRowDto[] = dated.map((entry) => {
    const startMs = msFromYmd(entry.startYmd!)
    const endMs = msFromYmd(entry.endYmd!)
    const startPct = ((startMs - minMs!) / span) * 100
    const widthPct = Math.max(1.2, ((endMs - startMs) / span) * 100)
    const accent =
      entry.initiative.status === "in_progress" ||
      entry.initiative.status === "at_risk" ||
      entry.initiative.connectedToCurrentCycle
    return {
      entry,
      label: entry.initiative.epic.title,
      startPct,
      widthPct,
      variant: accent ? "accent" : "default",
    }
  })
  return {
    rows,
    hasDatedTimeline: hasRealDates || dated.length > 0,
    timelineStartYmd: formatYmdLocal(new Date(minMs)),
    timelineEndYmd: formatYmdLocal(new Date(maxMs)),
  }
}

function parseWindowDays(window: string): number {
  const match = /^(\d+)d$/i.exec(window.trim())
  if (!match) return 90
  const days = Number(match[1])
  if (!Number.isFinite(days) || days < 1) return 90
  return Math.min(365, Math.floor(days))
}

export function buildRoadmapWindow(windowParam: string): RoadmapWindowDto {
  const days = parseWindowDays(windowParam)
  const to = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - days)
  return { from: formatYmdLocal(from), to: formatYmdLocal(to) }
}

export function buildRoadmapSummary(input: {
  windowParam: string
  items: RoadmapWorkItemRow[]
  committedBacklogIds: Set<string>
  cycleActive: boolean
  sprints: ScrumSprintState[]
  itemCommittedSprintIds: Map<string, string[]>
}): RoadmapSummaryDto {
  const initiatives = buildInitiatives(input.items, input.committedBacklogIds, input.cycleActive)
  const panorama = buildPanorama(initiatives)
  const sprintsById = new Map(input.sprints.map((s) => [s.sprintPublicId, s]))
  const epicSchedule = buildEpicSchedule({
    initiatives,
    items: input.items,
    sprintsById,
    itemCommittedSprintIds: input.itemCommittedSprintIds,
  })
  const epicGantt = buildEpicGantt(epicSchedule)
  const risks: RoadmapRiskDto[] = initiatives
    .filter((i) => i.status === "at_risk" && i.atRiskReason)
    .map((i) => ({
      epicPublicId: i.epic.backlogItemPublicId,
      epicTitle: i.epic.title,
      reason: i.atRiskReason!,
    }))
  const groups: RoadmapSummaryDto["groups"] = { now: [], next: [], later: [], completed: [] }
  for (const i of initiatives) {
    groups[i.horizon].push(i.epic.backlogItemPublicId)
  }
  let completedItems = 0
  let inProgressItems = 0
  let blockedItems = 0
  for (const item of input.items) {
    if (item.status === "done") completedItems++
    else if (item.status === "in_progress") inProgressItems++
    if (item.isBlocked) blockedItems++
  }
  return {
    window: buildRoadmapWindow(input.windowParam),
    summary: {
      totalItems: input.items.length,
      completedItems,
      inProgressItems,
      blockedItems,
    },
    panorama,
    initiatives,
    epicSchedule,
    epicGantt,
    risks,
    groups,
  }
}
