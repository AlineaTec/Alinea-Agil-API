import type { ScrumBacklogItemState } from "../../project-scrum-backlog/domain/scrum-backlog-item.js"
import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { ProjectKanbanFlowConfigState } from "../../project-kanban-core/domain/kanban-flow.js"
import type { KanbanFlowService } from "../../project-kanban-core/services/kanban-flow.service.js"
import type { WorkspaceAuditLogListRow } from "../../workspace-audit-log/domain/workspace-audit-log-list-row.js"
import type { WorkspaceAuditLogRepository } from "../../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import {
  KANBAN_METRICS_AUDIT_LOOKBACK_DAYS,
  KANBAN_METRICS_AGING_TOP_N,
  KANBAN_METRICS_DEFAULT_THROUGHPUT_WEEKS,
  KANBAN_METRICS_MAX_RANGE_DAYS,
} from "../domain/kanban-metrics.constants.js"
import { KanbanMetricsValidationError } from "../domain/kanban-metrics.errors.js"
import { assertCanReadKanbanMetrics } from "../policies/kanban-metrics-authorization.policy.js"
import { resolveTerminalColumnPublicId } from "./kanban-flow-terminal.js"
import {
  groupAuditByItemId,
  KANBAN_METRICS_AUDIT_ACTIONS,
  KANBAN_METRICS_AUDIT_CATEGORIES,
  medianNumber,
  readEntryColumnFromRelease,
  readToColumnPublicId,
} from "./kanban-metrics-audit.helpers.js"

export type KanbanMetricsColumnSnapshotDto = {
  columnPublicId: string
  name: string
  wipLimit: number | null
  currentItemCount: number
}

export type KanbanMetricsFlowSnapshotDto = {
  columns: KanbanMetricsColumnSnapshotDto[]
  blockedItemsCount: number
  itemsInFlowCount: number
  terminalColumnPublicId: string
  flowUpdatedAt: string
}

export type KanbanThroughputWeekDto = {
  weekStart: string
  completedItemsCount: number
}

export type KanbanLeadTimeFromFlowEntryDto = {
  basedOnAudit: boolean
  sampleCount: number
  medianDays: number | null
  /** Sesgo / límites del cálculo (p. ej. historial incompleto). */
  notes: string
}

export type KanbanThroughputResponseDto = {
  from: string
  to: string
  terminalColumnPublicId: string
  weeks: KanbanThroughputWeekDto[]
  leadTimeFromFlowEntry: KanbanLeadTimeFromFlowEntryDto
}

export type KanbanAgingItemDto = {
  backlogItemPublicId: string
  title: string
  columnPublicId: string
  columnName: string
  daysInCurrentColumn: number
  daysInFlowSegment: number
  source: "audit_replay" | "fallback_updated_at"
}

export type KanbanAgingByColumnDto = {
  columnPublicId: string
  name: string
  itemCount: number
  maxDaysInCurrentColumn: number
}

export type KanbanAgingResponseDto = {
  asOf: string
  topOldest: KanbanAgingItemDto[]
  byColumn: KanbanAgingByColumnDto[]
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0))
}

function endOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999))
}

/** Lunes 00:00 UTC de la semana ISO que contiene `d`. */
export function startOfUtcWeekMonday(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dow = x.getUTCDay()
  const mondayOffset = dow === 0 ? -6 : 1 - dow
  x.setUTCDate(x.getUTCDate() + mondayOffset)
  x.setUTCHours(0, 0, 0, 0)
  return x
}

function weekKeyUtcMonday(d: Date): string {
  return startOfUtcWeekMonday(d).toISOString().slice(0, 10)
}

function addUtcDays(d: Date, days: number): Date {
  const x = new Date(d.getTime())
  x.setUTCDate(x.getUTCDate() + days)
  return x
}

function calendarDaysBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / 86_400_000)
}

function rangeSpanDays(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / 86_400_000)
}

export function parseMetricsDateBoundary(raw: string, which: "from" | "to"): Date {
  const s = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const base = new Date(`${s}T00:00:00.000Z`)
    if (which === "from") return base
    return endOfUtcDay(base)
  }
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) {
    throw new KanbanMetricsValidationError(`Invalid date: ${raw}`)
  }
  return d
}

export function resolveThroughputDateRange(
  query: { from?: string; to?: string },
  now: Date,
): { from: Date; to: Date } {
  const hasFrom = query.from !== undefined && query.from.trim() !== ""
  const hasTo = query.to !== undefined && query.to.trim() !== ""

  if (!hasFrom && !hasTo) {
    const to = now
    const monday = startOfUtcWeekMonday(now)
    const from = addUtcDays(monday, -7 * (KANBAN_METRICS_DEFAULT_THROUGHPUT_WEEKS - 1))
    return { from, to }
  }

  if (hasFrom && hasTo) {
    const from = parseMetricsDateBoundary(query.from!, "from")
    let to = parseMetricsDateBoundary(query.to!, "to")
    if (from.getTime() > to.getTime()) {
      throw new KanbanMetricsValidationError("`from` must be before or equal to `to`.")
    }
    if (rangeSpanDays(from, to) > KANBAN_METRICS_MAX_RANGE_DAYS) {
      throw new KanbanMetricsValidationError(
        `Date range cannot exceed ${KANBAN_METRICS_MAX_RANGE_DAYS} days.`,
      )
    }
    return { from, to }
  }

  if (hasFrom) {
    const from = parseMetricsDateBoundary(query.from!, "from")
    const to = now
    if (from.getTime() > to.getTime()) {
      throw new KanbanMetricsValidationError("`from` cannot be after current time.")
    }
    if (rangeSpanDays(from, to) > KANBAN_METRICS_MAX_RANGE_DAYS) {
      throw new KanbanMetricsValidationError(
        `Date range cannot exceed ${KANBAN_METRICS_MAX_RANGE_DAYS} days.`,
      )
    }
    return { from, to }
  }

  const to = parseMetricsDateBoundary(query.to!, "to")
  const monday = startOfUtcWeekMonday(to)
  const from = addUtcDays(monday, -7 * (KANBAN_METRICS_DEFAULT_THROUGHPUT_WEEKS - 1))
  if (rangeSpanDays(from, to) > KANBAN_METRICS_MAX_RANGE_DAYS) {
    throw new KanbanMetricsValidationError(
      `Date range cannot exceed ${KANBAN_METRICS_MAX_RANGE_DAYS} days.`,
    )
  }
  return { from, to }
}

function enumerateWeekStarts(from: Date, to: Date): string[] {
  const keys: string[] = []
  let cur = startOfUtcWeekMonday(from)
  const end = startOfUtcWeekMonday(to)
  while (cur.getTime() <= end.getTime()) {
    keys.push(cur.toISOString().slice(0, 10))
    cur = addUtcDays(cur, 7)
  }
  return keys
}

function collectLeadTimeSamples(
  rows: WorkspaceAuditLogListRow[],
  terminalId: string,
  rangeFrom: Date,
  rangeTo: Date,
): number[] {
  const byItem = groupAuditByItemId(rows)
  const samples: number[] = []
  for (const evs of byItem.values()) {
    let enteredFlowAt: Date | null = null
    for (const e of evs) {
      if (e.category === "kanban_backlog_item" && e.action === "released_to_flow") {
        enteredFlowAt = e.occurredAt
      }
      if (e.category === "kanban_backlog_item" && e.action === "returned_to_backlog") {
        enteredFlowAt = null
      }
      if (e.category === "kanban_board_item" && e.action === "moved_between_columns") {
        const to = readToColumnPublicId(e.nextValue)
        if (to === terminalId && enteredFlowAt) {
          const doneAt = e.occurredAt
          if (doneAt >= rangeFrom && doneAt <= rangeTo) {
            samples.push(calendarDaysBetween(enteredFlowAt, doneAt))
          }
          enteredFlowAt = null
        }
      }
    }
  }
  return samples
}

function lastEnteredCurrentColumnAt(
  evs: WorkspaceAuditLogListRow[],
  targetCol: string,
): Date | null {
  let lastEnter: Date | null = null
  for (const e of evs) {
    if (e.category === "kanban_backlog_item" && e.action === "released_to_flow") {
      const entry = readEntryColumnFromRelease(e.nextValue)
      if (entry === targetCol) {
        lastEnter = e.occurredAt
      }
    }
    if (e.category === "kanban_board_item" && e.action === "moved_between_columns") {
      const to = readToColumnPublicId(e.nextValue)
      if (to === targetCol) {
        lastEnter = e.occurredAt
      }
    }
  }
  return lastEnter
}

function replayFinalColumn(evs: WorkspaceAuditLogListRow[]): string | null {
  let col: string | null = null
  for (const e of evs) {
    if (e.category === "kanban_backlog_item" && e.action === "released_to_flow") {
      col = readEntryColumnFromRelease(e.nextValue)
    }
    if (e.category === "kanban_backlog_item" && e.action === "returned_to_backlog") {
      col = null
    }
    if (e.category === "kanban_board_item" && e.action === "moved_between_columns") {
      const to = readToColumnPublicId(e.nextValue)
      if (to) col = to
    }
  }
  return col
}

function flowSegmentStartAt(evs: WorkspaceAuditLogListRow[], now: Date): Date | null {
  let enteredFlowAt: Date | null = null
  for (const e of evs) {
    if (e.occurredAt.getTime() > now.getTime()) break
    if (e.category === "kanban_backlog_item" && e.action === "released_to_flow") {
      enteredFlowAt = e.occurredAt
    }
    if (e.category === "kanban_backlog_item" && e.action === "returned_to_backlog") {
      enteredFlowAt = null
    }
  }
  return enteredFlowAt
}

export class KanbanMetricsService {
  constructor(
    private readonly backlogRepo: ScrumBacklogRepository,
    private readonly projectRuntimeService: ProjectRuntimeService,
    private readonly kanbanFlowService: KanbanFlowService,
    private readonly auditLogRepository: WorkspaceAuditLogRepository | null = null,
  ) {}

  async getFlowSnapshot(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<KanbanMetricsFlowSnapshotDto> {
    assertCanReadKanbanMetrics(actor)
    await this.projectRuntimeService.requireKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const flow = await this.kanbanFlowService.getFlowConfigOrThrow(workspacePublicId, projectPublicId)
    const items = await this.backlogRepo.listKanbanBoardItems(workspacePublicId, projectPublicId)
    return this.buildSnapshot(flow, items)
  }

  buildSnapshot(flow: ProjectKanbanFlowConfigState, items: ScrumBacklogItemState[]): KanbanMetricsFlowSnapshotDto {
    const terminalColumnPublicId = resolveTerminalColumnPublicId(flow)
    const byColumn = new Map<string, number>()
    for (const col of flow.columns) {
      byColumn.set(col.columnPublicId, 0)
    }
    let blockedItemsCount = 0
    let itemsInFlowCount = 0
    for (const item of items) {
      const colId = item.kanbanColumnPublicId
      if (!colId) continue
      itemsInFlowCount += 1
      if (item.isBlocked === true) blockedItemsCount += 1
      const n = byColumn.get(colId)
      if (n !== undefined) {
        byColumn.set(colId, n + 1)
      }
    }
    const columnsSorted = flow.columns.slice().sort((a, b) => a.position - b.position)
    const columns: KanbanMetricsColumnSnapshotDto[] = columnsSorted.map((c) => ({
      columnPublicId: c.columnPublicId,
      name: c.name,
      wipLimit: c.wipLimit,
      currentItemCount: byColumn.get(c.columnPublicId) ?? 0,
    }))
    return {
      columns,
      blockedItemsCount,
      itemsInFlowCount,
      terminalColumnPublicId,
      flowUpdatedAt: flow.updatedAt.toISOString(),
    }
  }

  async getThroughput(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    query: { from?: string; to?: string },
    now: Date = new Date(),
  ): Promise<KanbanThroughputResponseDto> {
    assertCanReadKanbanMetrics(actor)
    await this.projectRuntimeService.requireKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const flow = await this.kanbanFlowService.getFlowConfigOrThrow(workspacePublicId, projectPublicId)
    const terminalId = resolveTerminalColumnPublicId(flow)
    const { from, to } = resolveThroughputDateRange(query, now)

    const lookbackStart = addUtcDays(startOfUtcDay(now), -KANBAN_METRICS_AUDIT_LOOKBACK_DAYS)
    const auditFrom = new Date(Math.min(lookbackStart.getTime(), from.getTime()))

    const rows =
      (await this.auditLogRepository?.listForProject({
        workspacePublicId,
        projectPublicId,
        categories: [...KANBAN_METRICS_AUDIT_CATEGORIES],
        actions: [...KANBAN_METRICS_AUDIT_ACTIONS],
        occurredAtFrom: auditFrom,
        occurredAtTo: to,
      })) ?? []

    const weekKeys = enumerateWeekStarts(from, to)
    const counts = new Map<string, number>()
    for (const k of weekKeys) counts.set(k, 0)

    for (const r of rows) {
      if (r.category !== "kanban_board_item" || r.action !== "moved_between_columns") continue
      const toCol = readToColumnPublicId(r.nextValue)
      if (toCol !== terminalId) continue
      if (r.occurredAt < from || r.occurredAt > to) continue
      const key = weekKeyUtcMonday(r.occurredAt)
      const cur = counts.get(key)
      if (cur !== undefined) {
        counts.set(key, cur + 1)
      }
    }

    const weeks: KanbanThroughputWeekDto[] = weekKeys.map((weekStart) => ({
      weekStart,
      completedItemsCount: counts.get(weekStart) ?? 0,
    }))

    const leadNotesBase =
      "Lead time = tiempo desde último released_to_flow hasta primer movimiento a la columna terminal (Done o última posición), por ítem. Si faltan eventos previos al lookback del log, el segmento puede quedar acotado o sesgado."

    let leadTimeFromFlowEntry: KanbanLeadTimeFromFlowEntryDto
    if (!this.auditLogRepository) {
      leadTimeFromFlowEntry = {
        basedOnAudit: false,
        sampleCount: 0,
        medianDays: null,
        notes: "Auditoría no configurada; lead time no calculado.",
      }
    } else {
      const samples = collectLeadTimeSamples(rows, terminalId, from, to).sort((a, b) => a - b)
      leadTimeFromFlowEntry = {
        basedOnAudit: true,
        sampleCount: samples.length,
        medianDays: medianNumber(samples),
        notes:
          samples.length === 0
            ? `${leadNotesBase} Sin completados en terminal en el rango (o sin release previo en el log cargado).`
            : leadNotesBase,
      }
    }

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      terminalColumnPublicId: terminalId,
      weeks,
      leadTimeFromFlowEntry,
    }
  }

  async getAging(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    now: Date = new Date(),
  ): Promise<KanbanAgingResponseDto> {
    assertCanReadKanbanMetrics(actor)
    await this.projectRuntimeService.requireKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const flow = await this.kanbanFlowService.getFlowConfigOrThrow(workspacePublicId, projectPublicId)
    const items = await this.backlogRepo.listKanbanBoardItems(workspacePublicId, projectPublicId)
    const colById = new Map(flow.columns.map((c) => [c.columnPublicId, c]))

    const lookbackStart = addUtcDays(startOfUtcDay(now), -KANBAN_METRICS_AUDIT_LOOKBACK_DAYS)
    const rows =
      (await this.auditLogRepository?.listForProject({
        workspacePublicId,
        projectPublicId,
        categories: [...KANBAN_METRICS_AUDIT_CATEGORIES],
        actions: [...KANBAN_METRICS_AUDIT_ACTIONS],
        occurredAtFrom: lookbackStart,
        occurredAtTo: now,
      })) ?? []

    const byItem = groupAuditByItemId(rows)
    const agingItems: KanbanAgingItemDto[] = []

    for (const item of items) {
      const colId = item.kanbanColumnPublicId
      if (!colId) continue
      const col = colById.get(colId)
      const colName = col?.name ?? colId
      const evs = byItem.get(item.backlogItemPublicId) ?? []
      const replayCol = replayFinalColumn(evs)
      let source: KanbanAgingItemDto["source"] = "audit_replay"
      let enteredColAt = lastEnteredCurrentColumnAt(evs, colId)

      if (replayCol !== colId || enteredColAt === null) {
        source = "fallback_updated_at"
        enteredColAt = item.updatedAt
      }

      const segmentStart = flowSegmentStartAt(evs, now)
      const daysInFlowSegment =
        segmentStart !== null ? calendarDaysBetween(segmentStart, now) : calendarDaysBetween(item.updatedAt, now)

      const title = item.title?.trim() ? item.title.trim() : "—"
      agingItems.push({
        backlogItemPublicId: item.backlogItemPublicId,
        title,
        columnPublicId: colId,
        columnName: colName,
        daysInCurrentColumn: calendarDaysBetween(enteredColAt, now),
        daysInFlowSegment,
        source,
      })
    }

    agingItems.sort((a, b) => b.daysInCurrentColumn - a.daysInCurrentColumn)
    const topOldest = agingItems.slice(0, KANBAN_METRICS_AGING_TOP_N)

    const byColumnMap = new Map<string, { name: string; itemCount: number; maxDays: number }>()
    for (const c of flow.columns) {
      byColumnMap.set(c.columnPublicId, { name: c.name, itemCount: 0, maxDays: 0 })
    }
    for (const a of agingItems) {
      const agg = byColumnMap.get(a.columnPublicId)
      if (!agg) continue
      agg.itemCount += 1
      agg.maxDays = Math.max(agg.maxDays, a.daysInCurrentColumn)
    }
    const byColumn: KanbanAgingByColumnDto[] = flow.columns
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((c) => {
        const agg = byColumnMap.get(c.columnPublicId)!
        return {
          columnPublicId: c.columnPublicId,
          name: agg.name,
          itemCount: agg.itemCount,
          maxDaysInCurrentColumn: agg.maxDays,
        }
      })

    return { asOf: now.toISOString(), topOldest, byColumn }
  }
}
