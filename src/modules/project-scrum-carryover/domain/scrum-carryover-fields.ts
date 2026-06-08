/**
 * Campos expuestos en JSON para ítems de backlog / planning (MVP carryover).
 * Se derivan en lectura; no se persisten en el work item.
 */
export type ScrumCarryoverJsonFields = {
  isCarryover: boolean
  lastNotCompletedSprintPublicId: string | null
  lastNotCompletedSprintName: string | null
  lastNotCompletedClosedAt: string | null
}

export function emptyScrumCarryoverJsonFields(): ScrumCarryoverJsonFields {
  return {
    isCarryover: false,
    lastNotCompletedSprintPublicId: null,
    lastNotCompletedSprintName: null,
    lastNotCompletedClosedAt: null,
  }
}
