/** Ciclo de vida del sprint. En esta fase solo se opera con `planning` y `ready_for_execution`. */
export const SCRUM_SPRINT_STATUSES = [
  "planning",
  "ready_for_execution",
  "active",
  "closed",
] as const

export type ScrumSprintStatus = (typeof SCRUM_SPRINT_STATUSES)[number]

/** Estados que bloquean re-comprometer el mismo ítem en otro sprint (MVP + transición futura a `active`). */
export const SPRINT_STATUSES_BLOCKING_OTHER_COMMITMENT: ReadonlySet<ScrumSprintStatus> = new Set([
  "planning",
  "ready_for_execution",
  "active",
])

export function isScrumSprintStatus(v: string): v is ScrumSprintStatus {
  return (SCRUM_SPRINT_STATUSES as readonly string[]).includes(v)
}
