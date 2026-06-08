/**
 * Calendario operativo para `sessionDate` y ventanas de sugerencias (contracts-docs daily-alignment OQ-11).
 * Fallback: `WORKSPACE_OPERATIONAL_TIME_ZONE` o `UTC`.
 */

const FALLBACK_IANA = "UTC"

export function resolveOperationalTimeZoneIana(): string {
  const raw = process.env.WORKSPACE_OPERATIONAL_TIME_ZONE?.trim()
  if (raw && isValidIanaTimeZone(raw)) {
    return raw
  }
  return FALLBACK_IANA
}

function isValidIanaTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** YYYY-MM-DD del instante `d` en la zona operativa. */
export function formatYmdInZone(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d)
  const y = parts.find((p) => p.type === "year")?.value
  const m = parts.find((p) => p.type === "month")?.value
  const day = parts.find((p) => p.type === "day")?.value
  if (!y || !m || !day) {
    return d.toISOString().slice(0, 10)
  }
  return `${y}-${m}-${day}`
}

/** `today` operativo (fecha civil en la zona). */
export function todayYmdOperational(timeZone: string): string {
  return formatYmdInZone(new Date(), timeZone)
}

function weekdayIndexInZone(d: Date, timeZone: string): number {
  const w = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(d)
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return map[w] ?? 0
}

/**
 * Día laborable previo civil en la zona (lun–vie). Si `sessionYmd` es domingo, retrocede hasta viernes.
 */
export function previousBusinessDayYmdFromSessionYmd(sessionYmd: string, timeZone: string): string {
  let d = ymdToUtcNoonApprox(sessionYmd)
  d = addCalendarDaysUtc(d, -1)
  while (isWeekend(d, timeZone)) {
    d = addCalendarDaysUtc(d, -1)
  }
  return formatYmdInZone(d, timeZone)
}

function ymdToUtcNoonApprox(ymd: string): Date {
  const [y, m, day] = ymd.split("-").map((x) => Number.parseInt(x, 10))
  return new Date(Date.UTC(y, (m ?? 1) - 1, day ?? 1, 12, 0, 0))
}

function addCalendarDaysUtc(d: Date, delta: number): Date {
  const copy = new Date(d.getTime())
  copy.setUTCDate(copy.getUTCDate() + delta)
  return copy
}

function isWeekend(d: Date, timeZone: string): boolean {
  const idx = weekdayIndexInZone(d, timeZone)
  return idx === 0 || idx === 6
}

/** Inicio/fin UTC para coincidir `workDate` de time logging (00:00Z del YMD UTC del día de referencia). */
export function utcWorkDateRangeForOperationalReferenceYmd(referenceYmd: string): { from: Date; toExclusive: Date } {
  const from = new Date(`${referenceYmd}T00:00:00.000Z`)
  const next = addCalendarDaysUtc(from, 1)
  return { from, toExclusive: next }
}

/** Ventana `occurredAt` para auditoría: día calendario UTC del `referenceYmd` (pragmático v1; ver README). */
export function auditOccurredAtRangeForReferenceYmd(referenceYmd: string): { from: Date; to: Date } {
  const from = new Date(`${referenceYmd}T00:00:00.000Z`)
  const to = new Date(`${referenceYmd}T23:59:59.999Z`)
  return { from, to }
}
