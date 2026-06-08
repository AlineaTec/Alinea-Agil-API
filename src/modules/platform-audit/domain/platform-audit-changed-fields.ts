/**
 * Diff superficial de claves entre dos objetos planos (v1).
 */
export function shallowChangedFieldNames(before: unknown, after: unknown): string[] | null {
  if (before === null && after === null) return null
  if (typeof before !== "object" || before === null || Array.isArray(before)) return null
  if (typeof after !== "object" || after === null || Array.isArray(after)) return null
  const a = before as Record<string, unknown>
  const b = after as Record<string, unknown>
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  const changed: string[] = []
  for (const k of keys) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) changed.push(k)
  }
  return changed.length > 0 ? changed.sort() : null
}
