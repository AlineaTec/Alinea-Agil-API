import type { SprintBoardColumn } from "../../project-scrum-sprint-board/domain/sprint-board-column.js"
import { isSprintBoardColumn } from "../../project-scrum-sprint-board/domain/sprint-board-column.js"

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** Fecha en UTC YYYY-MM-DD. */
export function utcYmd(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

/**
 * Días calendario **incluidos** entre dos instantes, usando su parte UTC fecha.
 * Si end &lt; start, devuelve `[]`.
 */
export function enumerateUtcCalendarDaysInclusive(start: Date, end: Date): string[] {
  const out: string[] = []
  let y = start.getUTCFullYear()
  let m = start.getUTCMonth()
  let day = start.getUTCDate()
  const endT = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())
  for (;;) {
    const cur = Date.UTC(y, m, day)
    if (cur > endT) break
    out.push(`${y}-${pad2(m + 1)}-${pad2(day)}`)
    const nd = new Date(Date.UTC(y, m, day))
    nd.setUTCDate(nd.getUTCDate() + 1)
    y = nd.getUTCFullYear()
    m = nd.getUTCMonth()
    day = nd.getUTCDate()
  }
  return out
}

export function endOfUtcDayFromYmd(ymd: string): Date {
  const [a, b, c] = ymd.split("-").map((x) => parseInt(x, 10))
  return new Date(Date.UTC(a, (b ?? 1) - 1, c ?? 1, 23, 59, 59, 999))
}

export function parseSprintBoardMove(
  nextValue: unknown,
  sprintPublicId: string,
): { sprintPublicId: string; boardColumn: SprintBoardColumn } | null {
  if (typeof nextValue !== "object" || nextValue === null) return null
  const o = nextValue as Record<string, unknown>
  const sp = o.sprintPublicId
  const col = o.boardColumn
  if (typeof sp !== "string" || sp !== sprintPublicId) return null
  if (typeof col !== "string" || !isSprintBoardColumn(col)) return null
  return { sprintPublicId: sp, boardColumn: col }
}

/** Línea ideal: lineal desde `initial` (día 0) a 0 (último día). v1. */
export function idealRemainingLinear(
  initialCommitted: number,
  dayIndex: number,
  numCalendarDays: number,
): number {
  if (numCalendarDays < 1) return 0
  if (initialCommitted <= 0) return 0
  if (numCalendarDays === 1) return 0
  const t = (numCalendarDays - 1 - dayIndex) / (numCalendarDays - 1)
  return initialCommitted * t
}

export type SimItem = {
  boardColumn: SprintBoardColumn
  storyPoints: number | null
}

export function sumRemainingStoryPoints(
  byId: ReadonlyMap<string, SimItem>,
  itemIds: readonly string[],
): { remaining: number; hasUnestimatedInScope: boolean } {
  let remaining = 0
  let hasUnestimatedInScope = false
  for (const id of itemIds) {
    const s = byId.get(id)
    if (!s) continue
    if (s.storyPoints === null) {
      hasUnestimatedInScope = true
      continue
    }
    if (s.boardColumn !== "done") {
      remaining += s.storyPoints
    }
  }
  return { remaining, hasUnestimatedInScope }
}

export function sumCompletedStoryPoints(
  byId: ReadonlyMap<string, SimItem>,
  itemIds: readonly string[],
): { completed: number; hasUnestimatedInScope: boolean } {
  let completed = 0
  let hasUnestimatedInScope = false
  for (const id of itemIds) {
    const s = byId.get(id)
    if (!s) continue
    if (s.storyPoints === null) {
      hasUnestimatedInScope = true
      continue
    }
    if (s.boardColumn === "done") {
      completed += s.storyPoints
    }
  }
  return { completed, hasUnestimatedInScope }
}
