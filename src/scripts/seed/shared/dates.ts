/** Fecha UTC a medianoche. */
export function utcDate(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
}

export function daysAgo(base: Date, days: number): Date {
  const x = new Date(base.getTime())
  x.setUTCDate(x.getUTCDate() - days)
  return x
}

export function daysAhead(base: Date, days: number): Date {
  return daysAgo(base, -days)
}
