/**
 * Política de renovación mensual: día 1 de cada mes, calendario UTC (conservador;
 * alinear TZ por workspace en evolución — contracts-docs open-questions).
 */

/** Normaliza a medianoche UTC del calendario dado (solo día). */
export function utcMidnight(year: number, monthIndex0: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex0, day, 0, 0, 0, 0))
}

/**
 * Primer día del mes siguiente respecto a `reference` (en UTC).
 * Si `reference` es 15 ene → 1 feb.
 */
export function nextFirstOfMonthUtc(reference: Date): Date {
  const y = reference.getUTCFullYear()
  const m = reference.getUTCMonth()
  return utcMidnight(y, m + 1, 1)
}

/**
 * Fecha del día 1 del mes **actual** de `reference` (UTC).
 */
export function startOfMonthUtc(reference: Date): Date {
  const y = reference.getUTCFullYear()
  const m = reference.getUTCMonth()
  return utcMidnight(y, m, 1)
}

/**
 * Añade un mes calendario al día 1 representado por `firstOfMonth` (object Date en UTC día 1).
 */
export function addOneMonthToFirstOfMonthUtc(firstOfMonth: Date): Date {
  const y = firstOfMonth.getUTCFullYear()
  const m = firstOfMonth.getUTCMonth()
  return utcMidnight(y, m + 1, 1)
}

/**
 * ¿Debe considerarse que `asOf` ya alcanzó o pasó la fecha de renovación `nextRenewalDate`?
 * Comparación por componentes de fecha UTC (día completo).
 */
export function isRenewalDue(asOf: Date, nextRenewalDate: Date): boolean {
  const a = asOf.getTime()
  const n = nextRenewalDate.getTime()
  return a >= n
}
