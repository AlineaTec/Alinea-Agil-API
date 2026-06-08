import {
  FLOW_TIME_DEFAULT_WEEKS,
  FLOW_TIME_MAX_RANGE_DAYS,
} from "./flow-time.constants.js"
import { FlowTimeValidationError } from "./flow-time.errors.js"

const MS_PER_DAY = 86_400_000

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * MS_PER_DAY)
}

function rangeSpanDays(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MS_PER_DAY
}

/**
 * Parsers `from` / `to` que pueden ser:
 * - instants ISO 8601 completos, o
 * - fecha `YYYY-MM-DD` (interpretada en **UTC** a medianoche para from; to exclusivo = medianoche Día N en UTC).
 * Si ambos faltan: últimas `FLOW_TIME_DEFAULT_WEEKS` semanas con `to = now` y `from` retrocediendo 12*7 días.
 */
export function parseFlowTimeInstant(raw: string): Date {
  const s = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T00:00:00.000Z`)
  }
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) {
    throw new FlowTimeValidationError(`Invalid date or instant: ${raw}`)
  }
  return d
}

export type FlowTimeWindow = {
  from: Date
  to: Date
  /** IANA: fuente v1; si no hay persistencia de workspace, `UTC` y nota en payload. */
  timeZone: string
}

const DEFAULT_TIME_ZONE = "UTC"

/**
 * `from` inclusivo, `to` exclusivo: `[from, to)`.
 * Fecha suelta YYYY-MM-DD en `to` = comienzo de ese **día** en UTC, exclusivo (coincide con fin de día anterior + 1ms si se ajusta).
 * Para to como solo fecha, interpretación v1: **límite superior exclusivo** = instante 00:00 UTC del día `to`
 * (los completados con timestamp &lt; ese instante entran, los del propio 00:00 no).
 */
export function resolveFlowTimeWindow(
  query: { from?: string; to?: string; timeZone?: string },
  now: Date,
): FlowTimeWindow {
  const timeZone = query.timeZone?.trim() || DEFAULT_TIME_ZONE
  const hasFrom = query.from !== undefined && query.from.trim() !== ""
  const hasTo = query.to !== undefined && query.to.trim() !== ""

  if (!hasFrom && !hasTo) {
    const to = now
    const from = addDays(to, -7 * FLOW_TIME_DEFAULT_WEEKS)
    return { from, to, timeZone }
  }

  if (hasFrom && hasTo) {
    const fromQ = query.from!.trim()
    const toQ = query.to!.trim()
    const from = parseFlowTimeInstant(fromQ)
    let to: Date
    if (/^\d{4}-\d{2}-\d{2}$/.test(toQ) && toQ.length === 10) {
      to = new Date(`${toQ}T00:00:00.000Z`)
    } else {
      to = parseFlowTimeInstant(toQ)
    }
    if (from.getTime() >= to.getTime()) {
      throw new FlowTimeValidationError("`from` must be before `to` (exclusive).")
    }
    if (rangeSpanDays(from, to) > FLOW_TIME_MAX_RANGE_DAYS) {
      throw new FlowTimeValidationError(
        `Date range cannot exceed ${FLOW_TIME_MAX_RANGE_DAYS} days.`,
      )
    }
    return { from, to, timeZone }
  }

  if (hasFrom) {
    const from = parseFlowTimeInstant(query.from!)
    const to = now
    if (from.getTime() >= to.getTime()) {
      throw new FlowTimeValidationError("`from` must be before `to` (now).")
    }
    if (rangeSpanDays(from, to) > FLOW_TIME_MAX_RANGE_DAYS) {
      throw new FlowTimeValidationError(
        `Date range cannot exceed ${FLOW_TIME_MAX_RANGE_DAYS} days.`,
      )
    }
    return { from, to, timeZone }
  }

  const to = parseFlowTimeInstant(query.to!)
  const from = addDays(to, -7 * FLOW_TIME_DEFAULT_WEEKS)
  if (from.getTime() >= to.getTime()) {
    throw new FlowTimeValidationError("`from` must be before `to`.")
  }
  if (rangeSpanDays(from, to) > FLOW_TIME_MAX_RANGE_DAYS) {
    throw new FlowTimeValidationError(
      `Date range cannot exceed ${FLOW_TIME_MAX_RANGE_DAYS} days.`,
    )
  }
  return { from, to, timeZone }
}

export function defaultWorkspaceTimeZoneForPayload(): string {
  return DEFAULT_TIME_ZONE
}
