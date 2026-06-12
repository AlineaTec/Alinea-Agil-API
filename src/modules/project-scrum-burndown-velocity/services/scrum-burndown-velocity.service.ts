import type { ScrumSprintState } from "../../project-scrum-sprint-planning/domain/scrum-sprint.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import { assertFrozenClosureSnapshotCompleteForV2 } from "../../project-scrum-sprint-metrics/domain/sprint-metrics-v2.aggregation.js"
import { SprintMetricsService } from "../../project-scrum-sprint-metrics/services/sprint-metrics.service.js"
import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { WorkspaceAuditLogListRow } from "../../workspace-audit-log/domain/workspace-audit-log-list-row.js"
import type { WorkspaceAuditLogRepository } from "../../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import type { SprintBoardColumn } from "../../project-scrum-sprint-board/domain/sprint-board-column.js"
import {
  BURNDOWN_VELOCITY_CALCULATION_VERSION,
} from "../domain/burndown-velocity.constants.js"
import { BurndownVelocityNotFoundError, BurndownVelocityValidationError } from "../domain/burndown-velocity.errors.js"
import {
  endOfUtcDayFromYmd,
  enumerateUtcCalendarDaysInclusive,
  idealRemainingLinear,
  parseSprintBoardMove,
  sumCompletedStoryPoints,
  sumRemainingStoryPoints,
  sumStoryPointsByColumn,
  type SimItem,
  utcYmd,
} from "./burndown-replay.js"

const VELOCITY_LAST_N_MAX = 12

type SimEvent = {
  t: Date
  kind: "join" | "board" | "points"
  itemId: string
  boardColumn?: SprintBoardColumn
  storyPoints?: number | null
}

function applyEvent(state: Map<string, SimItem>, e: SimEvent): void {
  if (e.kind === "join") {
    if (state.has(e.itemId)) return
    state.set(e.itemId, {
      boardColumn: "to_do",
      storyPoints: e.storyPoints === undefined ? null : e.storyPoints,
    })
    return
  }
  if (e.kind === "board") {
    const row = state.get(e.itemId)
    if (!row || e.boardColumn === undefined) return
    row.boardColumn = e.boardColumn
    return
  }
  if (e.kind === "points") {
    const row = state.get(e.itemId)
    if (!row) return
    row.storyPoints = e.storyPoints === null || e.storyPoints === undefined ? null : e.storyPoints
  }
}

function stateAtEndOf(
  events: SimEvent[],
  tEnd: Date,
): Map<string, SimItem> {
  const sorted = [...events].sort((a, b) => a.t.getTime() - b.t.getTime() || a.itemId.localeCompare(b.itemId))
  const st = new Map<string, SimItem>()
  for (const e of sorted) {
    if (e.t.getTime() > tEnd.getTime()) break
    applyEvent(st, e)
  }
  return st
}

function scopePointsAt(
  state: ReadonlyMap<string, SimItem>,
  ids: readonly string[],
): number {
  let s = 0
  for (const id of ids) {
    const r = state.get(id)
    if (!r) continue
    if (r.storyPoints === null) continue
    s += r.storyPoints
  }
  return s
}

export type SprintBurndownCumulativeFlowPoint = {
  toDoPoints: number
  inProgressPoints: number
  inReviewPoints: number
  donePoints: number
}

export type SprintBurndownDayPoint = {
  date: string
  remainingPoints: number
  idealRemainingPoints: number
  cumulativeFlow: SprintBurndownCumulativeFlowPoint
  scopeChangedThisDay?: boolean
  scopeChangeNote?: string | null
}

export type SprintBurndownResponse = {
  sprintPublicId: string
  projectPublicId: string
  workspacePublicId: string
  unit: "story_points"
  calculationVersion: string
  initialCommittedPoints: number | null
  completedPointsAsOfLastDay: number
  scopeChangeDetected: boolean
  days: SprintBurndownDayPoint[]
  hasSufficientData: boolean
  dataQualityWarnings: string[]
  calculationNotes: string[]
}

export type VelocitySprintPoint = {
  sprintPublicId: string
  name: string
  closedAt: string
  completedStoryPoints: number
  committedStoryPoints: number
  dataQualityWarnings: string[]
}

export type ProjectVelocityResponse = {
  projectPublicId: string
  workspacePublicId: string
  unit: "story_points"
  calculationVersion: string
  lastN: number
  sprints: VelocitySprintPoint[]
  averageVelocityLastN: number | null
  hasSufficientData: boolean
  dataQualityWarnings: string[]
  calculationNotes: string[]
}

export class ScrumBurndownVelocityService {
  constructor(
    private readonly sprintRepo: ScrumSprintPlanningRepository,
    private readonly backlogRepo: ScrumBacklogRepository,
    private readonly auditRepo: WorkspaceAuditLogRepository,
    private readonly projectRuntime: ProjectRuntimeService,
    private readonly sprintMetrics: SprintMetricsService,
  ) {}

  async getSprintBurndown(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
    options: { includeIdealLine: boolean },
  ): Promise<SprintBurndownResponse> {
    await this.projectRuntime.requireScrumWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const sprint = await this.sprintRepo.findSprintByPublicId(
      workspacePublicId,
      projectPublicId,
      sprintPublicId,
    )
    if (!sprint) throw new BurndownVelocityNotFoundError()

    if (sprint.status === "planning" || sprint.status === "ready_for_execution") {
      throw new BurndownVelocityValidationError(
        "Burndown is only available for active or closed sprints.",
      )
    }
    if (!sprint.startDate || !sprint.endDate) {
      throw new BurndownVelocityValidationError("Sprint is missing start or end date.")
    }

    const now = new Date()
    const windowEnd = sprint.status === "closed" && sprint.closure
      ? new Date(
          Math.min(
            sprint.endDate.getTime(),
            sprint.closure.closedAt.getTime(),
          ),
        )
      : sprint.endDate
    const seriesEnd = sprint.status === "active" ? new Date(Math.min(sprint.endDate.getTime(), now.getTime())) : windowEnd
    if (seriesEnd.getTime() < sprint.startDate.getTime()) {
      throw new BurndownVelocityValidationError("Sprint has invalid date window for burndown.")
    }

    const daysYmd = enumerateUtcCalendarDaysInclusive(sprint.startDate, seriesEnd)
    if (daysYmd.length === 0) {
      throw new BurndownVelocityValidationError("No calendar days in sprint window for burndown.")
    }

    const calculationNotes: string[] = []
    const dataQualityWarnings: string[] = []

    if (sprint.status === "closed" && sprint.closure) {
      try {
        assertFrozenClosureSnapshotCompleteForV2(sprint.closure.items)
      } catch {
        throw new BurndownVelocityValidationError(
          "Sprint closure snapshot is not compatible with current metrics (missing frozen story points / AC). Burndown requires v2-style closure data.",
        )
      }
    }

    const auditRows = await this.auditRepo.listForProject({
      workspacePublicId,
      projectPublicId,
      categories: ["scrum_sprint_board_item", "scrum_backlog_item"],
      actions: ["moved_between_columns", "story_points_updated"],
      occurredAtFrom: new Date(sprint.startDate.getTime() - 60_000),
      occurredAtTo: new Date(Math.max(sprint.endDate.getTime(), now.getTime()) + 86_400_000),
    })

    const { events, itemIds, boardMoveCount, syntheticFromClosure, initialForIdeal, joinMeta } =
      await this.buildBurndownSimulationInput(
        workspacePublicId,
        projectPublicId,
        sprint,
        auditRows,
        calculationNotes,
        dataQualityWarnings,
      )

    if (syntheticFromClosure) {
      calculationNotes.push(
        "Sprint had no board move events in audit: applied closure columns at close time to approximate end-of-sprint state (honest for flat burn until close).",
      )
    } else if (boardMoveCount === 0 && sprint.status === "active") {
      dataQualityWarnings.push(
        "no_sprint_board_audit_events: daily remaining is inferred; last day is reconciled to live board when today is the last day.",
      )
      calculationNotes.push(
        "No sprint board column moves found in project audit: remaining before the last simulated day reflects all items as not done (unmoved) except where live board reconciles the last day.",
      )
    }

    const firstDayYmd = daysYmd[0]!
    const tFirstEnd = endOfUtcDayFromYmd(firstDayYmd)
    const stateFirst = stateAtEndOf(events, tFirstEnd)
    const initialScopeDay1 = scopePointsAt(stateFirst, itemIds)
    if (joinMeta.recommendedInitialForIdeal > 0) {
      if (Math.abs(initialScopeDay1 - joinMeta.recommendedInitialForIdeal) > 0.0001) {
        calculationNotes.push(
          "Scope at end of first day differs from committed points baseline used for the ideal line; ideal line may not match mid-sprint scope changes.",
        )
      }
    }
    const baselineIdeal = initialForIdeal > 0 ? initialForIdeal : initialScopeDay1
    if (baselineIdeal <= 0) {
      dataQualityWarnings.push("insufficient_estimated_committed_story_points: ideal line is 0; burndown is of limited use.")
    }

    const nDays = daysYmd.length
    const fixedDays: SprintBurndownDayPoint[] = []
    let prevSc: number | null = null
    let scopeChangeDetected = false
    let warnedUnestimated = false
    for (let i = 0; i < nDays; i++) {
      const d = daysYmd[i]!
      const tEnd = endOfUtcDayFromYmd(d)
      const st = stateAtEndOf(events, tEnd)
      const { remaining, hasUnestimatedInScope } = sumRemainingStoryPoints(st, itemIds)
      if (hasUnestimatedInScope && !warnedUnestimated) {
        warnedUnestimated = true
        dataQualityWarnings.push("unestimated_items_in_sprint: remaining excludes items without story points (per product v1).")
      }
      const sc = scopePointsAt(st, itemIds)
      const flow = sumStoryPointsByColumn(st, itemIds)
      const changed = prevSc !== null && sc !== prevSc
      if (changed) scopeChangeDetected = true
      prevSc = sc
      const ideal = options.includeIdealLine
        ? idealRemainingLinear(baselineIdeal, i, nDays)
        : 0
      fixedDays.push({
        date: d,
        remainingPoints: Math.round(remaining * 1e6) / 1e6,
        idealRemainingPoints: options.includeIdealLine
          ? Math.round(ideal * 1e6) / 1e6
          : 0,
        cumulativeFlow: {
          toDoPoints: Math.round(flow.toDoPoints * 1e6) / 1e6,
          inProgressPoints: Math.round(flow.inProgressPoints * 1e6) / 1e6,
          inReviewPoints: Math.round(flow.inReviewPoints * 1e6) / 1e6,
          donePoints: Math.round(flow.donePoints * 1e6) / 1e6,
        },
        scopeChangedThisDay: changed,
        scopeChangeNote: changed
          ? "Scope (committed story points) changed vs previous day."
          : null,
      })
    }

    if (sprint.status === "active") {
      await this.reconcileLastDayWithLiveBoard(
        workspacePublicId,
        projectPublicId,
        sprint,
        daysYmd,
        fixedDays,
        calculationNotes,
      )
    }

    const lastSt = stateAtEndOf(
      events,
      endOfUtcDayFromYmd(daysYmd[daysYmd.length - 1]!),
    )
    const { completed } = sumCompletedStoryPoints(lastSt, itemIds)

    /** Sin movimientos en auditoría, la serie diaria no es fiable; el último día activo se reconcilió vía tablero. */
    const hasSufficientData = baselineIdeal > 0 && (syntheticFromClosure || boardMoveCount > 0)

    return {
      sprintPublicId: sprint.sprintPublicId,
      projectPublicId: sprint.projectPublicId,
      workspacePublicId: sprint.workspacePublicId,
      unit: "story_points",
      calculationVersion: BURNDOWN_VELOCITY_CALCULATION_VERSION,
      initialCommittedPoints: baselineIdeal > 0 ? Math.round(baselineIdeal * 1e6) / 1e6 : null,
      completedPointsAsOfLastDay: Math.round(completed * 1e6) / 1e6,
      scopeChangeDetected,
      days: fixedDays,
      hasSufficientData,
      dataQualityWarnings: [...new Set(dataQualityWarnings)],
      calculationNotes,
    }
  }

  private async reconcileLastDayWithLiveBoard(
    workspacePublicId: string,
    projectPublicId: string,
    sprint: ScrumSprintState,
    daysYmd: string[],
    fixedDays: SprintBurndownDayPoint[],
    calculationNotes: string[],
  ): Promise<void> {
    if (daysYmd.length === 0 || fixedDays.length === 0) return
    const lastYmd = daysYmd[daysYmd.length - 1]!
    if (utcYmd(new Date()) !== lastYmd) {
      return
    }
    const memberships = await this.sprintRepo.listMembershipsBySprintOrdered(
      workspacePublicId,
      projectPublicId,
      sprint.sprintPublicId,
    )
    let remaining = 0
    const flow: SprintBurndownCumulativeFlowPoint = {
      toDoPoints: 0,
      inProgressPoints: 0,
      inReviewPoints: 0,
      donePoints: 0,
    }
    for (const m of memberships) {
      const it = await this.backlogRepo.findByProjectAndItemId(
        workspacePublicId,
        projectPublicId,
        m.backlogItemPublicId,
      )
      if (!it) continue
      if (it.storyPoints === null) continue
      const sp = it.storyPoints
      const col: SprintBoardColumn = m.boardColumn ?? "to_do"
      if (col !== "done") {
        remaining += sp
      }
      switch (col) {
        case "to_do":
          flow.toDoPoints += sp
          break
        case "in_progress":
          flow.inProgressPoints += sp
          break
        case "in_review":
          flow.inReviewPoints += sp
          break
        case "done":
          flow.donePoints += sp
          break
        default: {
          const _x: never = col
          void _x
        }
      }
    }
    const last = fixedDays[fixedDays.length - 1]!
    if (Math.abs(last.remainingPoints - remaining) > 1e-6) {
      calculationNotes.push(
        "last_day_reconciled: remainingPoints for today was aligned to the live sprint board + backlog story points (source of truth).",
      )
    }
    last.remainingPoints = Math.round(remaining * 1e6) / 1e6
    last.cumulativeFlow = {
      toDoPoints: Math.round(flow.toDoPoints * 1e6) / 1e6,
      inProgressPoints: Math.round(flow.inProgressPoints * 1e6) / 1e6,
      inReviewPoints: Math.round(flow.inReviewPoints * 1e6) / 1e6,
      donePoints: Math.round(flow.donePoints * 1e6) / 1e6,
    }
  }

  private async buildBurndownSimulationInput(
    workspacePublicId: string,
    projectPublicId: string,
    sprint: ScrumSprintState,
    auditRows: WorkspaceAuditLogListRow[],
    calculationNotes: string[],
    _dataQualityWarnings: string[],
  ): Promise<{
    events: SimEvent[]
    itemIds: string[]
    boardMoveCount: number
    syntheticFromClosure: boolean
    initialForIdeal: number
    joinMeta: { recommendedInitialForIdeal: number }
  }> {
    const events: SimEvent[] = []
    let boardMoveCount = 0
    if (sprint.status === "closed" && sprint.closure) {
      const items = sprint.closure.items
      assertFrozenClosureSnapshotCompleteForV2(items)
      const itemIds = items.map((i) => i.backlogItemPublicId)
      const sprintStart = sprint.startDate!
      for (const row of items) {
        const sp = row.storyPointsAtClosure
        const pts = sp === undefined ? null : sp
        events.push({
          t: new Date(sprintStart.getTime()),
          kind: "join",
          itemId: row.backlogItemPublicId,
          storyPoints: pts,
        })
      }
      for (const r of auditRows) {
        if (r.category !== "scrum_sprint_board_item" || r.action !== "moved_between_columns") continue
        const parsed = parseSprintBoardMove(r.nextValue, sprint.sprintPublicId)
        const rBid = r.resourceBacklogItemPublicId
        if (!parsed || rBid === null || !itemIds.includes(rBid)) continue
        boardMoveCount += 1
        events.push({
          t: r.occurredAt,
          kind: "board",
          itemId: rBid,
          boardColumn: parsed.boardColumn,
        })
      }
      for (const r of auditRows) {
        if (r.category !== "scrum_backlog_item" || r.action !== "story_points_updated") continue
        const rBid = r.resourceBacklogItemPublicId
        if (rBid === null || !itemIds.includes(rBid)) continue
        const next = r.nextValue
        const nv = typeof next === "number" || next === null ? next : null
        events.push({
          t: r.occurredAt,
          kind: "points",
          itemId: rBid,
          storyPoints: nv,
        })
      }
      let syntheticFromClosure = false
      if (boardMoveCount === 0) {
        syntheticFromClosure = true
        const tClose = new Date(sprint.closure!.closedAt.getTime())
        for (const row of items) {
          events.push({
            t: tClose,
            kind: "board",
            itemId: row.backlogItemPublicId,
            boardColumn: row.finalBoardColumn,
          })
        }
      }
      const initialForIdeal = items.reduce((acc, i) => {
        const p = i.storyPointsAtClosure
        if (p === null || p === undefined) return acc
        return acc + p
      }, 0)
      return {
        events,
        itemIds,
        boardMoveCount,
        syntheticFromClosure,
        initialForIdeal,
        joinMeta: { recommendedInitialForIdeal: initialForIdeal },
      }
    }

    const memberships = await this.sprintRepo.listMembershipsBySprintOrdered(
      workspacePublicId,
      projectPublicId,
      sprint.sprintPublicId,
    )
    const itemIds: string[] = []
    for (const m of memberships) {
      itemIds.push(m.backlogItemPublicId)
    }
    if (itemIds.length === 0) {
      calculationNotes.push("Sprint has no committed backlog items; burndown is empty.")
    }
    let initialForIdeal = 0
    for (const m of memberships) {
      const it = await this.backlogRepo.findByProjectAndItemId(
        workspacePublicId,
        projectPublicId,
        m.backlogItemPublicId,
      )
      if (!it) continue
      const joinT = m.committedAt.getTime() < sprint.startDate!.getTime() ? sprint.startDate! : m.committedAt
      const pts = it.storyPoints
      if (typeof pts === "number" && pts >= 0) {
        const endFirst = endOfUtcDayFromYmd(utcYmd(sprint.startDate!))
        if (joinT.getTime() <= endFirst.getTime()) {
          initialForIdeal += pts
        }
      }
      events.push({
        t: new Date(Math.max(joinT.getTime(), sprint.startDate!.getTime())),
        kind: "join",
        itemId: m.backlogItemPublicId,
        storyPoints: it.storyPoints,
      })
    }
    for (const r of auditRows) {
      if (r.category !== "scrum_sprint_board_item" || r.action !== "moved_between_columns") continue
      const parsed = parseSprintBoardMove(r.nextValue, sprint.sprintPublicId)
      const rBid = r.resourceBacklogItemPublicId
      if (!parsed || rBid === null || !itemIds.includes(rBid)) continue
      boardMoveCount += 1
      events.push({
        t: r.occurredAt,
        kind: "board",
        itemId: rBid,
        boardColumn: parsed.boardColumn,
      })
    }
    for (const r of auditRows) {
      if (r.category !== "scrum_backlog_item" || r.action !== "story_points_updated") continue
      const rBid2 = r.resourceBacklogItemPublicId
      if (rBid2 === null || !itemIds.includes(rBid2)) continue
      const next = r.nextValue
      const nv = typeof next === "number" || next === null ? next : null
      events.push({
        t: r.occurredAt,
        kind: "points",
        itemId: rBid2,
        storyPoints: nv,
      })
    }
    return {
      events,
      itemIds,
      boardMoveCount,
      syntheticFromClosure: false,
      initialForIdeal,
      joinMeta: { recommendedInitialForIdeal: initialForIdeal },
    }
  }

  async getProjectVelocity(
    workspacePublicId: string,
    projectPublicId: string,
    lastN: number,
  ): Promise<ProjectVelocityResponse> {
    await this.projectRuntime.requireScrumWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const n = Math.min(Math.max(1, lastN), VELOCITY_LAST_N_MAX)
    const all = await this.sprintRepo.listSprintsByProject(workspacePublicId, projectPublicId)
    const closed = all
      .filter((s) => s.status === "closed" && s.closure)
      .sort((a, b) => b.closure!.closedAt.getTime() - a.closure!.closedAt.getTime())
    const calculationNotes: string[] = []
    const dataQualityWarnings: string[] = []
    const sprints: VelocitySprintPoint[] = []
    for (const sp of closed) {
      if (sprints.length >= n) break
      try {
        const m = await this.sprintMetrics.getBasicSprintMetrics(
          workspacePublicId,
          projectPublicId,
          sp.sprintPublicId,
        )
        const rowWarnings: string[] = []
        if (m.unestimatedCommittedItemsCount > 0) {
          rowWarnings.push("unestimated_committed_items_in_sprint")
        }
        if (m.plannedDurationDays === 1) {
          rowWarnings.push("short_sprint_planned_duration")
        }
        sprints.push({
          sprintPublicId: m.sprintPublicId,
          name: sp.name,
          closedAt: m.closedAt,
          completedStoryPoints: m.completedStoryPoints,
          committedStoryPoints: m.committedStoryPoints,
          dataQualityWarnings: rowWarnings,
        })
      } catch {
        calculationNotes.push(
          `Sprint ${sp.sprintPublicId} is closed but metrics could not be read (likely pre-v2 closure); skipped from velocity.`,
        )
      }
    }
    if (sprints.length < n && closed.length > sprints.length) {
      dataQualityWarnings.push("some_closed_sprints_excluded: incomplete metrics for excluded sprints (see calculationNotes).")
    }
    const nums = sprints.map((r) => r.completedStoryPoints)
    const averageVelocityLastN =
      nums.length >= 2
        ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 1e6) / 1e6
        : nums.length === 1
          ? Math.round(nums[0]! * 1e6) / 1e6
          : null
    return {
      projectPublicId,
      workspacePublicId,
      unit: "story_points",
      calculationVersion: BURNDOWN_VELOCITY_CALCULATION_VERSION,
      lastN: n,
      sprints,
      averageVelocityLastN,
      hasSufficientData: sprints.length > 0,
      dataQualityWarnings: [...new Set(dataQualityWarnings)],
      calculationNotes,
    }
  }
}
