/**
 * Enfoques que pueden existir en un proyecto **operativo** materializado.
 * (Subconjunto de `ManagementApproach` del draft: sin `not_ready_to_start`.)
 */
export const OPERATIONAL_APPROACHES = ["scrum", "kanban", "predictive_phases"] as const

export type OperationalApproach = (typeof OPERATIONAL_APPROACHES)[number]

export function isOperationalApproach(value: string): value is OperationalApproach {
  return (OPERATIONAL_APPROACHES as readonly string[]).includes(value)
}
