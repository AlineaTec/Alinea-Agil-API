import { formatYmdInZone } from "../../daily-alignment/domain/operational-calendar.js"
import { DAILY_PENDING_THRESHOLD_HOUR } from "./wizard-stage.js"

function weekdayIndexInZone(d: Date, timeZone: string): number {
  const w = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(d)
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return map[w] ?? 0
}

export function isBusinessDayInZone(d: Date, timeZone: string): boolean {
  const idx = weekdayIndexInZone(d, timeZone)
  return idx >= 1 && idx <= 5
}

export function currentHourInZone(d: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hour12: false,
  }).formatToParts(d)
  const hour = parts.find((p) => p.type === "hour")?.value
  return hour ? Number.parseInt(hour, 10) : 0
}

/** OQ-POS-03: daily pending alert escalates to medium at 14:00 operational. */
export function isDailyPendingThresholdReached(now: Date, timeZone: string): boolean {
  if (!isBusinessDayInZone(now, timeZone)) return false
  return currentHourInZone(now, timeZone) >= DAILY_PENDING_THRESHOLD_HOUR
}

export function ymdDaysAgoFromToday(todayYmd: string, days: number): string {
  const [y, m, d] = todayYmd.split("-").map((x) => Number.parseInt(x, 10))
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0))
  dt.setUTCDate(dt.getUTCDate() - days)
  return formatYmdInZone(dt, "UTC")
}
