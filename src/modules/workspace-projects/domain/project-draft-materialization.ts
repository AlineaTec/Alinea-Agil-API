export const MATERIALIZATION_STATUSES = [
  "none",
  "pending",
  "in_progress",
  "completed",
  "failed",
] as const

export type MaterializationStatus = (typeof MATERIALIZATION_STATUSES)[number]

/**
 * Subestado de materialización (bootstrap). Idempotencia: ver servicio `materializeDraft`.
 */
export type MaterializationMeta = {
  status: MaterializationStatus
  materializedProjectPublicId: string | null
  lastError?: string
  attemptedAt?: Date
  completedAt?: Date
}

export function emptyMaterializationMeta(): MaterializationMeta {
  return {
    status: "none",
    materializedProjectPublicId: null,
  }
}
