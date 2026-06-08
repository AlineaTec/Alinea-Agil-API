/**
 * Enfoques de gestión / salidas del motor (v1). Sin "híbrido simple".
 */
export const MANAGEMENT_APPROACHES = [
  "scrum",
  "kanban",
  "predictive_phases",
  "not_ready_to_start",
] as const

export type ManagementApproach = (typeof MANAGEMENT_APPROACHES)[number]

export const OPERATIONAL_MANAGEMENT_APPROACHES: ReadonlySet<ManagementApproach> = new Set([
  "scrum",
  "kanban",
  "predictive_phases",
])
