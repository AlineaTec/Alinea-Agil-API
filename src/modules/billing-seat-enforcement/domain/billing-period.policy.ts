/** 15 días calendario (**v1** gracia tras fallo de renovación reconocido). */
export const CALENDAR_MS_PER_DAY_V1_GRACE = 24 * 60 * 60 * 1000

export const CALENDAR_GRACE_DAYS_V1 = 15

export function addCalendarDaysUtc(start: Date, days: number): Date {
  const d = new Date(start.getTime())
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

export function isWithinGraceWallClock(now: Date, startsAt: Date | null, endsAt: Date | null): boolean {
  if (!startsAt || !endsAt) return false
  return now >= startsAt && now <= endsAt
}

/** Fin de ventana de gracia: `startsAt` más **exactamente `CALENDAR_GRACE_DAYS_V1` dias cal**. */
export function computeGraceEndsAtInclusivePattern(startsAt: Date): Date {
  return addCalendarDaysUtc(startsAt, CALENDAR_GRACE_DAYS_V1)
}

export type ResolvedBillingOperationalView = {
  /** Tras superar ventana grace sin recuperar ⇒ `false`; resto trabajo normal **durante grace** (**v1**). */
  canUsePrimaryWorkspaceProductFeatures: boolean
  messagingGraceDay: number | null
  suspendedOperational: boolean
}
