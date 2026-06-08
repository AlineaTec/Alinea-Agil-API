/** Exige dependencia inyectada (path principal full postgres sin fallback legacy). */
export function requireInjected<T>(value: T | null | undefined, label: string): T {
  if (value == null) {
    throw new Error(`${label} must be provided (wire from runtimePersistence / app.ts)`)
  }
  return value
}
