/**
 * Umbrales v1 para señales operativas (no capacity planning; conteos de ítems no finalizados).
 * @see README.md
 */
export const OPERATIONAL_LOAD_OVERLOAD_MIN_ACTIVE_ITEMS = 8
export const OPERATIONAL_LOAD_HIGH_MIN_ACTIVE_ITEMS = 4
export const OPERATIONAL_LOAD_NORMAL_MAX_ACTIVE_ITEMS = 3
export const OPERATIONAL_UNASSIGNED_RATIO_WARN = 0.3

/** Niveles v1: `low` = 1–2 ítems activos; `idle` = 0. */
export type OperationalLoadLevel = "idle" | "low" | "normal" | "high" | "very_high"

export const IMPEDIMENT_ACTIVE_STATUSES = ["open", "in_review", "mitigating"] as const
