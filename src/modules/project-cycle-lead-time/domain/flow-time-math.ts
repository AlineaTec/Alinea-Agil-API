import { FLOW_TIME_DAYS_FRACTION_DIGITS } from "./flow-time.constants.js"

const MS_PER_DAY = 86_400_000
const PREC = 10 ** FLOW_TIME_DAYS_FRACTION_DIGITS

/** Días de diferencia (elapsed / reloj) entre `start` y `end`, ≥ 0, con un decimal. */
export function elapsedFractionalDays(start: Date, end: Date): number {
  const raw = (end.getTime() - start.getTime()) / MS_PER_DAY
  if (raw < 0) return 0
  return Math.round(raw * PREC) / PREC
}

export function averageOneDecimal(values: number[]): number | null {
  if (values.length === 0) return null
  const s = values.reduce((a, b) => a + b, 0) / values.length
  return Math.round(s * PREC) / PREC
}
